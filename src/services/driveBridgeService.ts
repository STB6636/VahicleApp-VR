import type { DriveTestResult, DriveUploadResult } from '@/types/vehicle.types';

export const ALLOWED_ATTACHMENT_MIMES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
] as const;

/** Must stay aligned with `MAX_BYTES = 15 * 1024 * 1024` in `docs/gas-drive-bridge/Code.gs`. */
export const MAX_DRIVE_BRIDGE_FILE_MB = 15;

/** Matches Portal SSO `SettingsGoogleDriveTab.tsx` strict Google Apps Script Web App `/exec` URL format. */
export const GAS_EXEC_URL_REGEX = /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/i;

export function isValidGasExecUrl(url: string | null | undefined): boolean {
  return GAS_EXEC_URL_REGEX.test(String(url || '').trim());
}

/**
 * Normalizes a configured `max_file_mb` setting into the valid GAS Drive Bridge range [1, 15].
 * Guards against empty strings, NaN, and non-finite numbers so file-size checks can never be bypassed.
 */
export function clampMaxFileMb(raw: unknown, fallback = 10): number {
  const safeFallback = Number.isFinite(fallback)
    ? Math.min(MAX_DRIVE_BRIDGE_FILE_MB, Math.max(1, fallback))
    : 10;
  if (raw === null || raw === undefined) return safeFallback;
  if (typeof raw === 'string' && raw.trim() === '') return safeFallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return safeFallback;
  return Math.min(MAX_DRIVE_BRIDGE_FILE_MB, Math.max(1, parsed));
}

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
  const effectiveMaxMb = clampMaxFileMb(maxFileMb, 10);
  const limitBytes = effectiveMaxMb * 1024 * 1024;
  if (file.size > limitBytes) {
    return {
      valid: false,
      error: `ขนาดไฟล์เกินกำหนด (สูงสุด ${effectiveMaxMb} MB)`,
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

function isBridgeSuccess(json: Record<string, unknown> | null): boolean {
  if (!json) return false;
  return json.ok === true || json.success === true;
}

export const driveBridgeService = {
  /**
   * Verifies that the configured GAS Web App `/exec` URL is reachable and responding
   * using Portal SSO v2.7.0 `GET ?action=verify&mode=ping` with fallback to `POST action=ping`.
   */
  async verifyBridgePing(bridgeUrl: string): Promise<DriveTestResult> {
    const trimmed = bridgeUrl.trim();
    if (!trimmed) {
      return {
        ok: false,
        message: 'กรุณาระบุลิงก์ Google Apps Script Web App (ลงท้ายด้วย /exec)',
      };
    }
    if (!isValidGasExecUrl(trimmed)) {
      return {
        ok: false,
        message: 'รูปแบบลิงก์ไม่ถูกต้อง ต้องขึ้นต้นด้วย https://script.google.com/macros/s/... และลงท้ายด้วย /exec',
      };
    }

    try {
      const sep = trimmed.includes('?') ? '&' : '?';
      const res = await fetch(`${trimmed}${sep}action=verify&mode=ping`, { method: 'GET' });
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (res.ok && isBridgeSuccess(json)) {
        const ver = json?.version ? ` (v${String(json.version)})` : '';
        return {
          ok: true,
          message: String(json?.message || `เชื่อมต่อ Google Apps Script Web App สำเร็จ${ver}`),
        };
      }
      return {
        ok: false,
        message: String(json?.error || json?.message || `เชื่อมต่อ GAS Web App ไม่สำเร็จ (${res.status})`),
      };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'ไม่สามารถติดต่อ Google Apps Script Web App ได้',
      };
    }
  },

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
      throw new Error('ยังไม่ได้ตั้งค่าลิงก์ Google Apps Script Web App (/exec) ในหน้าตั้งค่าระบบ');
    }
    if (!isValidGasExecUrl(bridgeUrl)) {
      throw new Error('ลิงก์ Google Apps Script Web App ไม่ถูกต้อง (ต้องลงท้ายด้วย /exec)');
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
    const cleanLabel = params.vehicleLabel.replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
    const subFolderName = cleanLabel ? `${params.vehicleCode} - ${cleanLabel}` : params.vehicleCode;

    // Dual-protocol payload compatible with BOTH Portal SSO DriveStorageBridge.gs v2.7.0
    // (`action: 'upload'`, `folderId`, `subFolderName`, `base64DataUrl`) AND Vehicle App Code.gs (`uploadFile`).
    const res = await fetch(bridgeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'upload',
        targetType: params.targetType,
        category: 'document',
        folderId: params.existingFolderId || folderId,
        rootFolderId: folderId,
        existingFolderId: params.existingFolderId || '',
        subFolderName: params.existingFolderId ? '' : subFolderName,
        vehicleCode: params.vehicleCode,
        vehicleLabel: params.vehicleLabel,
        fileName: params.file.name,
        mimeType: params.file.type,
        base64Data,
        base64DataUrl: `data:${params.file.type};base64,${base64Data}`,
      }),
    });

    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    const url = String(json?.url || json?.viewUrl || json?.webViewLink || '');

    if (!res.ok || !isBridgeSuccess(json) || !url) {
      throw new Error(
        String(json?.error || json?.message || `อัปโหลดไฟล์ไปยัง Google Drive ไม่สำเร็จ (${res.status})`)
      );
    }

    return {
      url,
      folderId: String(json?.folderId || params.existingFolderId || folderId),
      fileName: String(json?.fileName || params.file.name),
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
        message: 'กรุณาระบุลิงก์ Google Apps Script Web App (/exec) ก่อนตรวจสอบโฟลเดอร์',
      };
    }
    if (!isValidGasExecUrl(bridgeUrl)) {
      return {
        ok: false,
        message: 'รูปแบบลิงก์ GAS Web App ไม่ถูกต้อง (ต้องลงท้ายด้วย /exec)',
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
      // 1. Try Portal SSO v2.7.0 standard GET verification first
      const sep = bridgeUrl.includes('?') ? '&' : '?';
      const getRes = await fetch(
        `${bridgeUrl}${sep}action=verify&folderId=${encodeURIComponent(folderId)}`,
        { method: 'GET' }
      );
      const getJson = (await getRes.json().catch(() => null)) as Record<string, unknown> | null;
      if (getRes.ok && isBridgeSuccess(getJson)) {
        const folderName = String(getJson?.folderName || getJson?.name || '');
        return {
          ok: true,
          folderName: folderName || undefined,
          folderId: String(getJson?.folderId || folderId),
          message: String(
            getJson?.message ||
              (folderName ? `เชื่อมต่อโฟลเดอร์ "${folderName}" สำเร็จ` : `เชื่อมต่อโฟลเดอร์ (${folderId}) สำเร็จ`)
          ),
        };
      }

      // 2. Fallback to legacy Vehicle App Code.gs POST action=testFolder
      const postRes = await fetch(bridgeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'testFolder',
          folderId,
        }),
      });
      const postJson = (await postRes.json().catch(() => null)) as Record<string, unknown> | null;
      if (postRes.ok && isBridgeSuccess(postJson)) {
        const folderName = String(postJson?.folderName || '');
        return {
          ok: true,
          folderName: folderName || undefined,
          folderId: String(postJson?.folderId || folderId),
          message: String(postJson?.message || `เชื่อมต่อโฟลเดอร์ "${folderName || folderId}" สำเร็จ`),
        };
      }

      return {
        ok: false,
        message: String(
          postJson?.error ||
            postJson?.message ||
            getJson?.error ||
            getJson?.message ||
            `เชื่อมต่อโฟลเดอร์ Google Drive ไม่สำเร็จ (${postRes.status})`
        ),
      };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'ไม่สามารถติดต่อ GAS Google Drive Bridge ได้',
      };
    }
  },
};
