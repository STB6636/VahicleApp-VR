import type { DriveTestResult, DriveUploadResult } from '@/types/vehicle.types';

export const ALLOWED_ATTACHMENT_MIMES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
] as const;

/**
 * Extracts a Google Drive File/Folder ID from either a full Google Drive URL
 * or a raw Drive ID string.
 */
export function extractGoogleDriveId(input: string | null | undefined): string {
  const raw = String(input || '').trim();
  if (!raw) return '';
  const folderMatch = raw.match(/\/folders\/([a-zA-Z0-9_-]{10,})/);
  if (folderMatch) return folderMatch[1];
  const fileMatch = raw.match(/\/(?:file\/)?d\/([a-zA-Z0-9_-]{10,})/);
  if (fileMatch) return fileMatch[1];
  const paramMatch = raw.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (paramMatch) return paramMatch[1];
  if (/^[a-zA-Z0-9_-]{10,}$/.test(raw)) return raw;
  return '';
}

export function validateAttachmentFile(
  file: Pick<File, 'name' | 'type' | 'size'>,
  maxFileMb = 10
): { valid: boolean; error?: string } {
  const mime = String(file.type || '').toLowerCase();
  if (!(ALLOWED_ATTACHMENT_MIMES as readonly string[]).includes(mime)) {
    return {
      valid: false,
      error: 'รองรับเฉพาะไฟล์ PDF, JPG และ PNG เท่านั้น',
    };
  }
  const limitBytes = Math.max(1, maxFileMb) * 1024 * 1024;
  if (file.size > limitBytes) {
    return {
      valid: false,
      error: `ขนาดไฟล์เกินกำหนด (สูงสุด ${maxFileMb} MB)`,
    };
  }
  return { valid: true };
}

export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',').pop() || '' : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์ที่เลือกได้'));
    reader.readAsDataURL(file);
  });
}

export const driveBridgeService = {
  async uploadFile(params: {
    bridgeUrl: string;
    folderIdOrUrl: string;
    vehicleCode: string;
    vehicleLabel: string;
    existingFolderId?: string | null;
    targetType: 'activity' | 'vessel_license';
    file: File;
    maxFileMb?: number;
  }): Promise<DriveUploadResult> {
    const bridgeUrl = params.bridgeUrl.trim();
    if (!bridgeUrl) {
      throw new Error('ยังไม่ได้ตั้งค่า GAS Google Drive Bridge URL ในหน้าตั้งค่าระบบ');
    }

    const folderId = extractGoogleDriveId(params.folderIdOrUrl);
    if (!folderId) {
      throw new Error('ยังไม่ได้ตั้งค่า Google Drive Folder ID/URL ที่ถูกต้องในหน้าตั้งค่าระบบ');
    }

    const check = validateAttachmentFile(params.file, params.maxFileMb ?? 10);
    if (!check.valid) {
      throw new Error(check.error || 'ไฟล์ไม่ถูกต้อง');
    }

    const base64Data = await readFileAsBase64(params.file);

    // GAS Web App expects text/plain to avoid CORS preflight failures on script.google.com
    const res = await fetch(bridgeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'uploadFile',
        targetType: params.targetType,
        rootFolderId: folderId,
        existingFolderId: params.existingFolderId || '',
        vehicleCode: params.vehicleCode,
        vehicleLabel: params.vehicleLabel,
        fileName: params.file.name,
        mimeType: params.file.type,
        base64Data,
      }),
    });

    const json = (await res.json().catch(() => null)) as {
      ok?: boolean;
      url?: string;
      folderId?: string;
      fileName?: string;
      error?: string;
      message?: string;
    } | null;

    if (!res.ok || !json?.ok || !json.url) {
      throw new Error(json?.error || json?.message || `อัปโหลดไฟล์ไปยัง Google Drive ไม่สำเร็จ (${res.status})`);
    }

    return {
      url: json.url,
      folderId: json.folderId || params.existingFolderId || folderId,
      fileName: json.fileName || params.file.name,
    };
  },

  async testFolderLink(params: {
    bridgeUrl: string;
    folderIdOrUrl: string;
  }): Promise<DriveTestResult> {
    const bridgeUrl = params.bridgeUrl.trim();
    if (!bridgeUrl) {
      return {
        ok: false,
        message: 'กรุณาระบุ GAS Google Drive Bridge URL ก่อนตรวจสอบลิงก์โฟลเดอร์',
      };
    }

    const folderId = extractGoogleDriveId(params.folderIdOrUrl);
    if (!folderId) {
      return {
        ok: false,
        message: 'รูปแบบ Google Drive Folder ID หรือลิงก์ไม่ถูกต้อง',
      };
    }

    try {
      const res = await fetch(bridgeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'testFolder',
          folderId,
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        folderName?: string;
        folderId?: string;
        message?: string;
        error?: string;
      } | null;

      if (!res.ok || !json?.ok) {
        return {
          ok: false,
          message: json?.error || json?.message || `เชื่อมต่อ Google Drive Bridge ไม่สำเร็จ (${res.status})`,
        };
      }

      return {
        ok: true,
        folderName: json.folderName,
        folderId: json.folderId || folderId,
        message: json.message || `เชื่อมต่อโฟลเดอร์ "${json.folderName || folderId}" สำเร็จ`,
      };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'ไม่สามารถติดต่อ GAS Google Drive Bridge ได้',
      };
    }
  },
};
