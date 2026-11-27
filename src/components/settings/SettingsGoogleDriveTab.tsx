import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Swal from 'sweetalert2';
import { vehicleService } from '@/services/vehicleService';
import { driveBridgeService, isValidGasExecUrl } from '@/services/driveBridgeService';
import { QUERY_KEYS } from '@/lib/queryClient';
import { escapeHtml } from '@/lib/htmlUtils';
import { useUiStore } from '@/stores/useUiStore';
import type { AppSettingRow } from '@/types/vehicle.types';

type VerifyState = {
  status: 'idle' | 'testing' | 'ok' | 'error';
  message?: string;
  verifiedValue?: string;
};

interface SettingsGoogleDriveTabProps {
  settingsRows: AppSettingRow[];
}

const DRIVE_KEYS = [
  {
    key: 'gas_drive_bridge_url',
    label: 'ลิงก์ Google Apps Script Web App (ลงท้ายด้วย /exec)',
    placeholder: 'https://script.google.com/macros/s/AKfycb.../exec',
    hint: 'รองรับทั้ง Web App (/exec) ของ Portal SSO-VR (DriveStorageBridge v2.7.0+) และ docs/gas-drive-bridge/Code.gs v2.0',
    isScriptUrl: true,
  },
  {
    key: 'activity_folder_id',
    label: 'โฟลเดอร์เก็บไฟล์หลักฐานต่อภาษี / ซ่อมบำรุง (Google Drive Folder URL หรือ ID)',
    placeholder: 'https://drive.google.com/drive/folders/... หรือวาง Folder ID',
    hint: 'ใช้เก็บไฟล์แนบจากการบันทึกกิจกรรมต่ออายุภาษีและแจ้งซ่อมบำรุง',
    isScriptUrl: false,
  },
  {
    key: 'vessel_license_folder_id',
    label: 'โฟลเดอร์เก็บใบอนุญาตใช้เรือราชการ (Google Drive Folder URL หรือ ID)',
    placeholder: 'https://drive.google.com/drive/folders/... หรือวาง Folder ID',
    hint: 'ใช้เก็บไฟล์ใบอนุญาตใช้เรือราชการ (สร้างโฟลเดอร์ย่อยตามรหัส VHxxxx อัตโนมัติ)',
    isScriptUrl: false,
  },
] as const;

export function SettingsGoogleDriveTab({ settingsRows }: SettingsGoogleDriveTabProps) {
  const qc = useQueryClient();
  const showToast = useUiStore((s) => s.showToast);

  const [draft, setDraft] = useState<Record<string, string>>({
    gas_drive_bridge_url: '',
    activity_folder_id: '',
    vessel_license_folder_id: '',
  });
  const [verifyStates, setVerifyStates] = useState<Record<string, VerifyState>>({});
  const [saving, setSaving] = useState(false);

  const savedMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of settingsRows) m[r.key] = r.value ?? '';
    return m;
  }, [settingsRows]);

  const hydratedRef = useRef(false);
  const dirtyKeys = useMemo(
    () =>
      DRIVE_KEYS.filter((item) => (draft[item.key] ?? '').trim() !== (savedMap[item.key] ?? '').trim()).map(
        (i) => i.key
      ),
    [draft, savedMap]
  );

  useEffect(() => {
    if (settingsRows.length === 0) return;
    if (hydratedRef.current && dirtyKeys.length > 0) return;
    hydratedRef.current = true;
    setDraft({
      gas_drive_bridge_url: savedMap.gas_drive_bridge_url ?? '',
      activity_folder_id: savedMap.activity_folder_id ?? '',
      vessel_license_folder_id: savedMap.vessel_license_folder_id ?? '',
    });
  }, [settingsRows, savedMap, dirtyKeys.length]);

  const scriptUrl = (draft.gas_drive_bridge_url ?? '').trim();
  const scriptFormatValid = !scriptUrl || isValidGasExecUrl(scriptUrl);

  const handleVerifyKey = async (key: string) => {
    const val = (draft[key] ?? '').trim();
    setVerifyStates((prev) => ({ ...prev, [key]: { status: 'testing' } }));
    const res =
      key === 'gas_drive_bridge_url'
        ? await driveBridgeService.verifyBridgePing(val)
        : await driveBridgeService.testFolderLink({
            bridgeUrl: scriptUrl,
            folderIdOrUrl: val,
          });

    setVerifyStates((prev) => ({
      ...prev,
      [key]: {
        status: res.ok ? 'ok' : 'error',
        message: res.message,
        verifiedValue: res.ok ? val : undefined,
      },
    }));
    showToast(res.message, res.ok ? 'success' : 'error');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (dirtyKeys.length === 0) {
      showToast('ยังไม่มีรายการที่แก้ไขในแท็บ Google Drive Bridge', 'info');
      return;
    }

    const actFolder = (draft.activity_folder_id ?? '').trim();
    const vesselFolder = (draft.vessel_license_folder_id ?? '').trim();

    if ((actFolder || vesselFolder) && !scriptUrl) {
      showToast('กรุณากรอกลิงก์ Google Apps Script Web App (/exec) ก่อนบันทึกโฟลเดอร์', 'error');
      return;
    }

    if (scriptUrl && !isValidGasExecUrl(scriptUrl)) {
      showToast('รูปแบบลิงก์ Google Apps Script ไม่ถูกต้อง (ต้องลงท้ายด้วย /exec)', 'error');
      return;
    }

    // Pre-Save Verification Guard (mirrors Portal SSO SettingsGoogleDriveTab & Ex Project)
    for (const key of dirtyKeys) {
      const val = (draft[key] ?? '').trim();
      if (!val) continue; // Allow clearing a value intentionally
      const vState = verifyStates[key];
      if (vState?.status !== 'ok' || vState.verifiedValue !== val) {
        const meta = DRIVE_KEYS.find((k) => k.key === key);
        showToast(
          `กรุณากดปุ่มทดสอบ "${meta?.isScriptUrl ? 'ตรวจสอบการเชื่อมต่อ' : 'ตรวจสอบโฟลเดอร์'}" ให้ผ่านก่อนบันทึก (${meta?.label})`,
          'warning'
        );
        return;
      }
    }

    const changes = DRIVE_KEYS.filter((item) => dirtyKeys.includes(item.key)).map((item) => ({
      key: item.key,
      label: item.label,
      oldVal: savedMap[item.key] ?? '',
      newVal: (draft[item.key] ?? '').trim(),
    }));

    const summaryHtml = changes
      .map(
        (c) =>
          `<li style="margin-bottom:6px;text-align:left;"><strong>${escapeHtml(c.label)}</strong><br/><span style="color:#64748b;">เดิม:</span> ${escapeHtml(c.oldVal) || '(ว่าง)'}<br/><span style="color:#00744B;">ใหม่:</span> ${escapeHtml(c.newVal) || '(ว่าง)'}</li>`
      )
      .join('');

    const confirm = await Swal.fire({
      icon: 'question',
      title: 'ยืนยันการบันทึกตั้งค่า Google Drive Bridge?',
      html: `<ul style="padding-left:18px;font-size:13px;max-height:45vh;overflow:auto;">${summaryHtml}</ul>`,
      showCancelButton: true,
      confirmButtonText: 'ยืนยันบันทึก',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#00744B',
      reverseButtons: true,
    });
    if (!confirm.isConfirmed) return;

    setSaving(true);
    try {
      await vehicleService.updateSettings(
        changes.map((c) => ({
          key: c.key,
          value: c.newVal,
          description: c.label,
          setting_group: 'storage',
        }))
      );
      showToast('บันทึกตั้งค่า Google Drive Bridge เรียบร้อยแล้ว', 'success');
      await Promise.all([
        qc.invalidateQueries({ queryKey: QUERY_KEYS.settings }),
        qc.invalidateQueries({ queryKey: QUERY_KEYS.auditLogs }),
      ]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ', 'error');
    } finally {
      setSaving(false);
    }
  };

  const renderBadge = (key: string, val: string, isScriptUrl: boolean) => {
    const trimmed = val.trim();
    const st = verifyStates[key];
    if (st?.status === 'testing') {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/15 text-sky-700 dark:text-sky-300">
          กำลังตรวจสอบ...
        </span>
      );
    }
    if (st?.status === 'ok' && st.verifiedValue === trimmed && trimmed) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
          <i className="fa-solid fa-circle-check mr-1" />
          ตรวจสอบผ่านแล้ว
        </span>
      );
    }
    if (st?.status === 'error') {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300">
          <i className="fa-solid fa-circle-xmark mr-1" />
          ลิงก์ไม่ถูกต้อง
        </span>
      );
    }
    if (!trimmed) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
          ยังไม่ตั้งค่า
        </span>
      );
    }
    if (isScriptUrl && !isValidGasExecUrl(trimmed)) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300">
          ต้องลงท้ายด้วย /exec
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300">
        กรอกค่าแล้ว (รอยืนยัน)
      </span>
    );
  };

  return (
    <form onSubmit={handleSave} className="space-y-5">
      <div className="rounded-2xl bg-sky-50/70 dark:bg-sky-950/25 border border-sky-200 dark:border-sky-900/60 p-4 text-xs text-sky-900 dark:text-sky-200 space-y-1.5">
        <p className="font-extrabold flex items-center gap-2">
          <i className="fa-brands fa-google-drive text-sm" />
          มาตรฐานการเชื่อมต่อ Google Drive Bridge (รองรับ Portal SSO-VR &amp; Vehicle App)
        </p>
        <p className="leading-relaxed opacity-90">
          1. วางลิงก์ Web App จาก Google Apps Script ที่ลงท้ายด้วย <code>/exec</code> แล้วกด{' '}
          <strong>ตรวจสอบการเชื่อมต่อ</strong>
          <br />
          2. วางลิงก์หรือ Folder ID ของ Google Drive ทั้ง 2 โฟลเดอร์ แล้วกด{' '}
          <strong>ตรวจสอบโฟลเดอร์</strong> ให้ผ่านก่อนกดบันทึก (ระบบบังคับตรวจสอบลิงก์ก่อนบันทึกเสมอเพื่อป้องกันการอัปโหลดล้มเหลว)
        </p>
      </div>

      <section className="rounded-2xl bg-white dark:bg-[#11231B] border border-slate-200/80 dark:border-[#244737] overflow-hidden">
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-[#163024] border-b border-slate-200/80 dark:border-[#244737] flex items-center gap-2 text-sm font-extrabold text-[#00744B] dark:text-emerald-300">
          <i className="fa-solid fa-hard-drive" />
          <span>Google Drive Bridge &amp; โฟลเดอร์จัดเก็บเอกสาร</span>
        </div>

        <div className="p-5 space-y-5">
          {DRIVE_KEYS.map((item) => {
            const val = draft[item.key] ?? '';
            const state = verifyStates[item.key];
            const isDirty = val.trim() !== (savedMap[item.key] ?? '').trim();

            return (
              <div key={item.key} className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor={`drive-${item.key}`} className="bma-label mb-0">
                    {item.label}
                  </label>
                  <div className="flex items-center gap-2">
                    {isDirty && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300">
                        มีการแก้ไข
                      </span>
                    )}
                    {renderBadge(item.key, val, item.isScriptUrl)}
                    <code className="text-[11px] text-slate-400">{item.key}</code>
                  </div>
                </div>

                <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                  <input
                    id={`drive-${item.key}`}
                    type="text"
                    value={val}
                    onChange={(e) => {
                      const next = e.target.value;
                      setDraft((prev) => ({ ...prev, [item.key]: next }));
                      setVerifyStates((prev) => ({ ...prev, [item.key]: { status: 'idle' } }));
                    }}
                    placeholder={item.placeholder}
                    className={`bma-input flex-1 font-mono text-xs ${
                      item.isScriptUrl && !scriptFormatValid
                        ? 'border-rose-400 focus:border-rose-500'
                        : ''
                    }`}
                  />
                  <button
                    type="button"
                    disabled={state?.status === 'testing' || !val.trim()}
                    onClick={() => void handleVerifyKey(item.key)}
                    className="bma-btn-outline text-xs shrink-0"
                  >
                    <i
                      className={`fa-solid ${
                        state?.status === 'testing'
                          ? 'fa-spinner fa-spin'
                          : state?.status === 'ok'
                            ? 'fa-circle-check text-emerald-600'
                            : state?.status === 'error'
                              ? 'fa-circle-xmark text-rose-600'
                              : 'fa-plug'
                      }`}
                    />
                    <span>{item.isScriptUrl ? 'ตรวจสอบการเชื่อมต่อ' : 'ตรวจสอบโฟลเดอร์'}</span>
                  </button>
                </div>

                <p className="text-[11px] text-slate-500 dark:text-slate-400">{item.hint}</p>

                {state?.message && (
                  <p
                    className={`text-[11px] font-semibold ${
                      state.status === 'ok'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {state.message}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <div className="flex items-center justify-end gap-3">
        {dirtyKeys.length > 0 && (
          <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
            มีรายการที่ยังไม่ได้บันทึก {dirtyKeys.length} รายการ
          </span>
        )}
        <button
          type="submit"
          disabled={saving || dirtyKeys.length === 0}
          className="bma-btn-primary"
        >
          <i className={`fa-solid ${saving ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`} />
          <span>{saving ? 'กำลังบันทึก...' : 'บันทึกตั้งค่า Google Drive Bridge'}</span>
        </button>
      </div>
    </form>
  );
}
