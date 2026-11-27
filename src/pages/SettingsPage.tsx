import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Swal from 'sweetalert2';
import { vehicleService } from '@/services/vehicleService';
import { driveBridgeService, MAX_DRIVE_BRIDGE_FILE_MB } from '@/services/driveBridgeService';
import { QUERY_KEYS } from '@/lib/queryClient';
import { formatThaiDateTime } from '@/lib/thaiDate';
import { escapeHtml } from '@/lib/htmlUtils';
import { useUiStore } from '@/stores/useUiStore';
import type { AppSettingRow } from '@/types/vehicle.types';

const GROUP_LABELS: Record<string, { title: string; icon: string }> = {
  general: { title: 'ตั้งค่าทั่วไป (General)', icon: 'fa-sliders' },
  storage: { title: 'Google Drive Bridge & โฟลเดอร์จัดเก็บเอกสาร', icon: 'fa-hard-drive' },
  report: { title: 'ตั้งค่ารายงาน (Report)', icon: 'fa-file-pdf' },
};

const FOLDER_TEST_KEYS = new Set(['activity_folder_id', 'vessel_license_folder_id']);

export function SettingsPage() {
  const qc = useQueryClient();
  const showToast = useUiStore((s) => s.showToast);

  const [activeTab, setActiveTab] = useState<'settings' | 'audit'>('settings');
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [testStates, setTestStates] = useState<
    Record<string, { status: 'idle' | 'testing' | 'ok' | 'error'; message?: string }>
  >({});
  const [saving, setSaving] = useState(false);
  const [refreshingStatuses, setRefreshingStatuses] = useState(false);

  const [auditSearch, setAuditSearch] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState('all');

  const { data: settings = [], isLoading: loadingSettings } = useQuery({
    queryKey: QUERY_KEYS.settings,
    queryFn: vehicleService.listSettings,
  });

  const { data: health, refetch: refetchHealth } = useQuery({
    queryKey: QUERY_KEYS.schemaHealth,
    queryFn: vehicleService.getSchemaHealth,
  });

  const { data: auditLogs = [], isLoading: loadingAudit, refetch: refetchAudit } = useQuery({
    queryKey: QUERY_KEYS.auditLogs,
    queryFn: () => vehicleService.listAuditLogs(150),
    enabled: activeTab === 'audit',
  });

  useEffect(() => {
    if (settings.length === 0) return;
    const initial: Record<string, string> = {};
    for (const s of settings) initial[s.key] = s.value ?? '';
    setDraftValues(initial);
  }, [settings]);

  const groupedSettings = useMemo(() => {
    const groups = new Map<string, AppSettingRow[]>();
    for (const row of settings) {
      const grp = row.setting_group || 'general';
      if (!groups.has(grp)) groups.set(grp, []);
      groups.get(grp)!.push(row);
    }
    return Array.from(groups.entries());
  }, [settings]);

  const changedEntries = useMemo(() => {
    const changes: Array<{ key: string; description: string; oldVal: string; newVal: string }> = [];
    for (const s of settings) {
      const oldVal = s.value ?? '';
      const newVal = draftValues[s.key] ?? '';
      if (newVal !== oldVal) {
        changes.push({
          key: s.key,
          description: s.description || s.key,
          oldVal,
          newVal,
        });
      }
    }
    return changes;
  }, [settings, draftValues]);

  const handleTestFolderLink = async (key: string) => {
    const bridgeUrl = (draftValues.gas_drive_bridge_url || '').trim();
    const folderIdOrUrl = (draftValues[key] || '').trim();
    setTestStates((prev) => ({ ...prev, [key]: { status: 'testing' } }));
    const res = await driveBridgeService.testFolderLink({ bridgeUrl, folderIdOrUrl });
    setTestStates((prev) => ({
      ...prev,
      [key]: { status: res.ok ? 'ok' : 'error', message: res.message },
    }));
    showToast(res.message, res.ok ? 'success' : 'error');
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (changedEntries.length === 0) {
      showToast('ยังไม่มีรายการที่แก้ไข', 'info');
      return;
    }

    const warnVal = draftValues.warning_days_before;
    if (warnVal !== undefined) {
      const trimmedWarn = warnVal.trim();
      const parsedWarn = Number(trimmedWarn);
      if (!/^\d+$/.test(trimmedWarn) || !Number.isInteger(parsedWarn) || parsedWarn < 1 || parsedWarn > 365) {
        showToast('จำนวนวันแจ้งเตือนล่วงหน้าต้องเป็นจำนวนเต็มระหว่าง 1 - 365 วัน', 'error');
        return;
      }
    }

    const maxMbVal = draftValues.max_file_mb;
    if (maxMbVal !== undefined) {
      const trimmedMaxMb = maxMbVal.trim();
      const parsedMaxMb = Number(trimmedMaxMb);
      if (
        !/^\d+$/.test(trimmedMaxMb) ||
        !Number.isInteger(parsedMaxMb) ||
        parsedMaxMb < 1 ||
        parsedMaxMb > MAX_DRIVE_BRIDGE_FILE_MB
      ) {
        showToast(`ขนาดไฟล์สูงสุดต้องเป็นจำนวนเต็มระหว่าง 1 - ${MAX_DRIVE_BRIDGE_FILE_MB} MB`, 'error');
        return;
      }
    }

    const summaryHtml = changedEntries
      .map(
        (c) =>
          `<li style="margin-bottom:6px;text-align:left;"><strong>${escapeHtml(c.description)}</strong><br/><span style="color:#64748b;">เดิม:</span> ${escapeHtml(c.oldVal) || '(ว่าง)'}<br/><span style="color:#00744B;">ใหม่:</span> ${escapeHtml(c.newVal) || '(ว่าง)'}</li>`
      )
      .join('');

    const confirm = await Swal.fire({
      icon: 'question',
      title: 'ยืนยันการบันทึกการตั้งค่า?',
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
        changedEntries.map((c) => ({
          key: c.key,
          value:
            c.key === 'warning_days_before' || c.key === 'max_file_mb'
              ? String(Number(c.newVal.trim()))
              : c.newVal,
        }))
      );
      showToast(`บันทึกการตั้งค่า ${changedEntries.length} รายการเรียบร้อยแล้ว`, 'success');
      await Promise.all([
        qc.invalidateQueries({ queryKey: QUERY_KEYS.settings }),
        qc.invalidateQueries({ queryKey: QUERY_KEYS.vehicles }),
        qc.invalidateQueries({ queryKey: QUERY_KEYS.auditLogs }),
      ]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'บันทึกการตั้งค่าไม่สำเร็จ', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRefreshStatuses = async () => {
    setRefreshingStatuses(true);
    try {
      const updated = await vehicleService.refreshVehicleStatuses();
      showToast(
        updated > 0
          ? `รีเฟรชสถานะยานพาหนะสำเร็จ (อัปเดต ${updated} รายการ)`
          : 'สถานะยานพาหนะทั้งหมดเป็นปัจจุบันแล้ว',
        'success'
      );
      await Promise.all([
        qc.invalidateQueries({ queryKey: QUERY_KEYS.vehicles }),
        qc.invalidateQueries({ queryKey: QUERY_KEYS.auditLogs }),
        refetchHealth(),
      ]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'รีเฟรชสถานะไม่สำเร็จ', 'error');
    } finally {
      setRefreshingStatuses(false);
    }
  };

  const auditActions = useMemo(
    () => Array.from(new Set(auditLogs.map((l) => l.action))).sort(),
    [auditLogs]
  );

  const filteredAuditLogs = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    return auditLogs.filter((log) => {
      if (auditActionFilter !== 'all' && log.action !== auditActionFilter) return false;
      if (!q) return true;
      const hay = [
        log.action,
        log.actor_name,
        log.entity_type,
        log.entity_id,
        JSON.stringify(log.payload || {}),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [auditLogs, auditSearch, auditActionFilter]);

  return (
    <div className="space-y-6">
      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-2xl bg-white dark:bg-[#11231B] border border-slate-200 dark:border-[#244737] p-1">
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'settings'
                ? 'bg-gradient-to-r from-[#00744B] to-[#00A368] text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5'
            }`}
          >
            <i className="fa-solid fa-gears" />
            <span>ตั้งค่าระบบ &amp; สุขภาพฐานข้อมูล</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'audit'
                ? 'bg-gradient-to-r from-[#00744B] to-[#00A368] text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5'
            }`}
          >
            <i className="fa-solid fa-shield-halved" />
            <span>บันทึกการใช้งาน (Audit Logs)</span>
          </button>
        </div>

        <button
          type="button"
          disabled={refreshingStatuses}
          onClick={() => void handleRefreshStatuses()}
          className="bma-btn-outline text-xs"
        >
          <i className={`fa-solid ${refreshingStatuses ? 'fa-spinner fa-spin' : 'fa-arrows-rotate'}`} />
          <span>รีเฟรชสถานะยานพาหนะทั้งระบบ</span>
        </button>
      </div>

      {activeTab === 'settings' ? (
        <>
          {/* Schema Health Panel */}
          <section className="rounded-2xl bg-white dark:bg-[#11231B] border border-slate-200/80 dark:border-[#244737] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-extrabold text-base text-slate-800 dark:text-white">
                  สุขภาพฐานข้อมูล Schema <code>vehicleapp</code>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  ตรวจสอบการเชื่อมต่อ Multi-Schema บน Supabase โปรเจกต์เดียวกับ Portal SSO-VR
                </p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                {health?.healthy ? 'Schema Healthy' : 'กำลังตรวจสอบ...'}
              </span>
            </div>

            {health && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#183025]">
                  <p className="text-slate-500">Vehicle Types</p>
                  <p className="text-lg font-extrabold mt-0.5">{health.vehicle_types_count}</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#183025]">
                  <p className="text-slate-500">Vehicles</p>
                  <p className="text-lg font-extrabold mt-0.5">{health.vehicles_count}</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#183025]">
                  <p className="text-slate-500">Activities</p>
                  <p className="text-lg font-extrabold mt-0.5">{health.activities_count}</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#183025]">
                  <p className="text-slate-500">Settings</p>
                  <p className="text-lg font-extrabold mt-0.5">{health.settings_count}</p>
                </div>
              </div>
            )}
          </section>

          {/* Editable Settings Form */}
          <form onSubmit={handleSaveSettings} noValidate className="space-y-5">
            {loadingSettings ? (
              <div className="rounded-2xl bg-white dark:bg-[#11231B] border border-slate-200 dark:border-[#244737] py-12 text-center text-sm text-slate-400">
                กำลังโหลดพารามิเตอร์ตั้งค่าระบบ...
              </div>
            ) : (
              groupedSettings.map(([groupKey, rows]) => {
                const grpMeta = GROUP_LABELS[groupKey] || { title: groupKey, icon: 'fa-gear' };
                return (
                  <section
                    key={groupKey}
                    className="rounded-2xl bg-white dark:bg-[#11231B] border border-slate-200/80 dark:border-[#244737] overflow-hidden"
                  >
                    <div className="px-5 py-3.5 bg-slate-50 dark:bg-[#163024] border-b border-slate-200/80 dark:border-[#244737] flex items-center gap-2 text-sm font-extrabold text-[#00744B] dark:text-emerald-300">
                      <i className={`fa-solid ${grpMeta.icon}`} />
                      <span>{grpMeta.title}</span>
                    </div>

                    <div className="p-5 space-y-4">
                      {rows.map((row) => {
                        const val = draftValues[row.key] ?? '';
                        const isFolderTest = FOLDER_TEST_KEYS.has(row.key);
                        const testState = testStates[row.key];
                        const isDirty = val !== (row.value ?? '');

                        return (
                          <div key={row.key} className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <label htmlFor={`setting-${row.key}`} className="bma-label mb-0">
                                {row.description || row.key}
                              </label>
                              <div className="flex items-center gap-2">
                                {isDirty && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300">
                                    มีการแก้ไข
                                  </span>
                                )}
                                <code className="text-[11px] text-slate-400">{row.key}</code>
                              </div>
                            </div>

                            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                              {row.key === 'default_theme' ? (
                                <select
                                  id={`setting-${row.key}`}
                                  value={val}
                                  onChange={(e) =>
                                    setDraftValues((prev) => ({ ...prev, [row.key]: e.target.value }))
                                  }
                                  className="bma-input"
                                >
                                  <option value="light">โหมดสว่าง (light)</option>
                                  <option value="dark">โหมดถนอมสายตา (dark)</option>
                                </select>
                              ) : (
                                <input
                                  id={`setting-${row.key}`}
                                  type={
                                    row.key === 'warning_days_before' || row.key === 'max_file_mb'
                                      ? 'number'
                                      : 'text'
                                  }
                                  min={
                                    row.key === 'warning_days_before' || row.key === 'max_file_mb'
                                      ? 1
                                      : undefined
                                  }
                                  max={
                                    row.key === 'warning_days_before'
                                      ? 365
                                      : row.key === 'max_file_mb'
                                        ? MAX_DRIVE_BRIDGE_FILE_MB
                                        : undefined
                                  }
                                  step={
                                    row.key === 'warning_days_before' || row.key === 'max_file_mb'
                                      ? 1
                                      : undefined
                                  }
                                  value={val}
                                  onChange={(e) => {
                                    setDraftValues((prev) => ({ ...prev, [row.key]: e.target.value }));
                                    if (isFolderTest) {
                                      setTestStates((prev) => ({ ...prev, [row.key]: { status: 'idle' } }));
                                    }
                                  }}
                                  placeholder={
                                    row.key === 'gas_drive_bridge_url'
                                      ? 'https://script.google.com/macros/s/.../exec'
                                      : isFolderTest
                                        ? 'วาง Google Drive Folder URL หรือ Folder ID'
                                        : ''
                                  }
                                  className="bma-input flex-1"
                                />
                              )}

                              {isFolderTest && (
                                <button
                                  type="button"
                                  disabled={testState?.status === 'testing'}
                                  onClick={() => void handleTestFolderLink(row.key)}
                                  className="bma-btn-outline text-xs shrink-0"
                                >
                                  <i
                                    className={`fa-solid ${
                                      testState?.status === 'testing'
                                        ? 'fa-spinner fa-spin'
                                        : testState?.status === 'ok'
                                          ? 'fa-circle-check text-emerald-600'
                                          : testState?.status === 'error'
                                            ? 'fa-circle-xmark text-rose-600'
                                            : 'fa-plug'
                                    }`}
                                  />
                                  <span>ตรวจสอบลิงก์</span>
                                </button>
                              )}
                            </div>

                            {testState?.message && (
                              <p
                                className={`text-[11px] font-semibold ${
                                  testState.status === 'ok'
                                    ? 'text-emerald-700 dark:text-emerald-400'
                                    : 'text-rose-600 dark:text-rose-400'
                                }`}
                              >
                                {testState.message}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })
            )}

            <div className="flex items-center justify-end gap-3">
              {changedEntries.length > 0 && (
                <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
                  มีรายการที่ยังไม่ได้บันทึก {changedEntries.length} รายการ
                </span>
              )}
              <button
                type="submit"
                disabled={saving || changedEntries.length === 0}
                className="bma-btn-primary"
              >
                <i className={`fa-solid ${saving ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`} />
                <span>{saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}</span>
              </button>
            </div>
          </form>
        </>
      ) : (
        /* Audit Log Viewer */
        <section className="rounded-2xl bg-white dark:bg-[#11231B] border border-slate-200/80 dark:border-[#244737] overflow-hidden shadow-xs">
          <div className="p-4 border-b border-slate-200/80 dark:border-[#244737] flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5 flex-1">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
                <input
                  type="text"
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  placeholder="ค้นหาผู้ดำเนินการ, action, entity..."
                  className="bma-input pl-9 text-xs"
                />
              </div>

              <select
                value={auditActionFilter}
                onChange={(e) => setAuditActionFilter(e.target.value)}
                className="bma-input w-auto text-xs"
              >
                <option value="all">ทุก Action</option>
                {auditActions.map((act) => (
                  <option key={act} value={act}>
                    {act}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => void refetchAudit()}
              className="bma-btn-outline text-xs py-1.5"
            >
              <i className="fa-solid fa-rotate" />
              <span>รีเฟรช</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            {loadingAudit ? (
              <div className="py-12 text-center text-sm text-slate-400">กำลังโหลด Audit Logs...</div>
            ) : filteredAuditLogs.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-400">
                ไม่พบประวัติการใช้งานใน <code>vehicleapp.audit_logs</code>
              </div>
            ) : (
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-[#163024] font-bold text-slate-600 dark:text-emerald-200">
                  <tr>
                    <th className="px-4 py-3">วันเวลา (พ.ศ.)</th>
                    <th className="px-4 py-3">ผู้ดำเนินการ</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">ตาราง / รหัส</th>
                    <th className="px-4 py-3">รายละเอียด Payload</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#244737]">
                  {filteredAuditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/70 dark:hover:bg-white/5">
                      <td className="px-4 py-2.5 font-mono whitespace-nowrap text-slate-500">
                        {formatThaiDateTime(log.created_at, { showSeconds: true })}
                      </td>
                      <td className="px-4 py-2.5 font-bold text-slate-800 dark:text-white">
                        {log.actor_name || '-'}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="px-2 py-0.5 rounded-md font-mono text-[11px] font-bold bg-emerald-500/12 text-[#00744B] dark:text-emerald-300">
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                        {log.entity_type}
                        {log.entity_id ? ` (${log.entity_id.slice(0, 16)})` : ''}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[11px] text-slate-500 max-w-sm truncate">
                        {JSON.stringify(log.payload || {})}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
