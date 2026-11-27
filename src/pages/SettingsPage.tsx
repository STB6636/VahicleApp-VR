import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Swal from 'sweetalert2';
import { vehicleService } from '@/services/vehicleService';
import { MAX_DRIVE_BRIDGE_FILE_MB } from '@/services/driveBridgeService';
import { QUERY_KEYS } from '@/lib/queryClient';
import { formatThaiDateTime } from '@/lib/thaiDate';
import { escapeHtml } from '@/lib/htmlUtils';
import { useUiStore } from '@/stores/useUiStore';
import { SettingsGoogleDriveTab } from '@/components/settings/SettingsGoogleDriveTab';
import { SettingsVehicleTypesTab } from '@/components/settings/SettingsVehicleTypesTab';
import type { AppSettingRow } from '@/types/vehicle.types';

type SettingsTabId = 'general' | 'gdrive' | 'vehicle_types' | 'health' | 'audit';

const GROUP_LABELS: Record<string, { title: string; icon: string }> = {
  general: { title: 'ตั้งค่าทั่วไป การแจ้งเตือน และขีดจำกัดการแสดงผล (General)', icon: 'fa-sliders' },
  report: { title: 'ตั้งค่าหัวเอกสารรายงาน PDF / Excel (Report)', icon: 'fa-file-pdf' },
};

const INTEGER_RANGES: Record<string, { min: number; max: number; unit: string; label: string }> = {
  warning_days_before: { min: 1, max: 365, unit: 'วัน', label: 'จำนวนวันแจ้งเตือนล่วงหน้า' },
  max_file_mb: { min: 1, max: MAX_DRIVE_BRIDGE_FILE_MB, unit: 'MB', label: 'ขนาดไฟล์สูงสุด' },
  dashboard_tracking_limit: { min: 5, max: 100, unit: 'รายการ', label: 'จำนวนรายการคิวติดตามบน Dashboard' },
  dashboard_recent_limit: { min: 3, max: 50, unit: 'รายการ', label: 'จำนวนกิจกรรมล่าสุดบน Dashboard' },
  activities_page_size: { min: 5, max: 100, unit: 'รายการ/หน้า', label: 'จำนวนรายการประวัติกิจกรรมต่อหน้า' },
  notification_max_items: { min: 5, max: 100, unit: 'รายการ', label: 'จำนวนรายการแจ้งเตือนสูงสุดในกระดิ่ง' },
};

const BOOLEAN_KEYS = new Set(['notify_maintenance_status']);

export function SettingsPage() {
  const qc = useQueryClient();
  const showToast = useUiStore((s) => s.showToast);

  const [activeTab, setActiveTab] = useState<SettingsTabId>('general');
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
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
    enabled: activeTab === 'health' || activeTab === 'general',
  });

  const { data: cronStatus, refetch: refetchCron } = useQuery({
    queryKey: QUERY_KEYS.cronStatus,
    queryFn: vehicleService.getCronStatus,
    enabled: activeTab === 'health',
  });

  const { data: auditLogs = [], isLoading: loadingAudit, refetch: refetchAudit } = useQuery({
    queryKey: QUERY_KEYS.auditLogs,
    queryFn: () => vehicleService.listAuditLogs(150),
    enabled: activeTab === 'audit',
  });

  // General + Report settings only (Storage lives in dedicated Google Drive Bridge tab)
  const generalAndReportSettings = useMemo(
    () => settings.filter((s) => (s.setting_group || 'general') !== 'storage'),
    [settings]
  );

  const changedEntries = useMemo(() => {
    const changes: Array<{ key: string; description: string; oldVal: string; newVal: string }> = [];
    for (const s of generalAndReportSettings) {
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
  }, [generalAndReportSettings, draftValues]);

  // Dirty-guard prevents background React Query refetch from wiping in-progress edits
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (settings.length === 0) return;
    if (hydratedRef.current && changedEntries.length > 0) return;
    hydratedRef.current = true;
    const initial: Record<string, string> = {};
    for (const s of settings) initial[s.key] = s.value ?? '';
    setDraftValues(initial);
  }, [settings, changedEntries.length]);

  const groupedSettings = useMemo(() => {
    const groups = new Map<string, AppSettingRow[]>();
    for (const row of generalAndReportSettings) {
      const grp = row.setting_group || 'general';
      if (!groups.has(grp)) groups.set(grp, []);
      groups.get(grp)!.push(row);
    }
    return Array.from(groups.entries());
  }, [generalAndReportSettings]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (changedEntries.length === 0) {
      showToast('ยังไม่มีรายการที่แก้ไข', 'info');
      return;
    }

    for (const [key, rule] of Object.entries(INTEGER_RANGES)) {
      const raw = draftValues[key];
      if (raw === undefined) continue;
      const trimmed = raw.trim();
      const parsed = Number(trimmed);
      if (!/^\d+$/.test(trimmed) || !Number.isInteger(parsed) || parsed < rule.min || parsed > rule.max) {
        showToast(
          `${rule.label}ต้องเป็นจำนวนเต็มระหว่าง ${rule.min} - ${rule.max} ${rule.unit}`,
          'error'
        );
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
      const changedWarningDays = changedEntries.some((c) => c.key === 'warning_days_before');
      await vehicleService.updateSettings(
        changedEntries.map((c) => ({
          key: c.key,
          value: INTEGER_RANGES[c.key] ? String(Number(c.newVal.trim())) : c.newVal,
        }))
      );

      if (changedWarningDays) {
        await vehicleService.refreshVehicleStatuses().catch(() => {});
      }

      showToast(
        changedWarningDays
          ? `บันทึกการตั้งค่า ${changedEntries.length} รายการ และรีเฟรชสถานะยานพาหนะเรียบร้อยแล้ว`
          : `บันทึกการตั้งค่า ${changedEntries.length} รายการเรียบร้อยแล้ว`,
        'success'
      );
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

  const tabs: Array<{ id: SettingsTabId; label: string; icon: string }> = [
    { id: 'general', label: '1. ตั้งค่าทั่วไป & แจ้งเตือน', icon: 'fa-sliders' },
    { id: 'gdrive', label: '2. Google Drive Bridge', icon: 'fa-hard-drive' },
    { id: 'vehicle_types', label: '3. ประเภทยานพาหนะ (Dropdown)', icon: 'fa-tags' },
    { id: 'health', label: '4. สุขภาพฐานข้อมูล & Cron', icon: 'fa-heart-pulse' },
    { id: 'audit', label: '5. บันทึกการใช้งาน (Audit Logs)', icon: 'fa-shield-halved' },
  ];

  return (
    <div className="space-y-6">
      {/* 5-Tab Navigation Bar (Portal SSO Standard) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5 rounded-2xl bg-white dark:bg-[#11231B] border border-slate-200 dark:border-[#244737] p-1.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                activeTab === t.id
                  ? 'bg-gradient-to-r from-[#00744B] to-[#00A368] text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5'
              }`}
            >
              <i className={`fa-solid ${t.icon}`} />
              <span>{t.label}</span>
            </button>
          ))}
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

      {/* Tab 1: General & Report Settings */}
      {activeTab === 'general' && (
        <form onSubmit={handleSaveSettings} className="space-y-5">
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
                      const isDirty = val !== (row.value ?? '');
                      const intRule = INTEGER_RANGES[row.key];

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
                          ) : BOOLEAN_KEYS.has(row.key) ? (
                            <select
                              id={`setting-${row.key}`}
                              value={val.toLowerCase() === 'false' ? 'false' : 'true'}
                              onChange={(e) =>
                                setDraftValues((prev) => ({ ...prev, [row.key]: e.target.value }))
                              }
                              className="bma-input"
                            >
                              <option value="true">เปิดใช้งาน (true)</option>
                              <option value="false">ปิดใช้งาน (false)</option>
                            </select>
                          ) : (
                            <input
                              id={`setting-${row.key}`}
                              type={intRule ? 'number' : 'text'}
                              min={intRule?.min}
                              max={intRule?.max}
                              step={intRule ? 1 : undefined}
                              value={val}
                              onChange={(e) =>
                                setDraftValues((prev) => ({ ...prev, [row.key]: e.target.value }))
                              }
                              className="bma-input"
                            />
                          )}

                          {row.key === 'max_file_mb' && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              กำหนดได้สูงสุด {MAX_DRIVE_BRIDGE_FILE_MB} MB ตามเพดานการส่งไฟล์ของ GAS Google Drive Bridge
                            </p>
                          )}
                          {row.key === 'warning_days_before' && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              เมื่อบันทึกค่าใหม่ ระบบจะรีเฟรชสถานะยานพาหนะทั้งระบบให้อัตโนมัติ (1–365 วัน)
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
      )}

      {/* Tab 2: Google Drive Bridge */}
      {activeTab === 'gdrive' && <SettingsGoogleDriveTab settingsRows={settings} />}

      {/* Tab 3: Vehicle Types CRUD & Reorder */}
      {activeTab === 'vehicle_types' && <SettingsVehicleTypesTab />}

      {/* Tab 4: Schema Health & Daily Cron */}
      {activeTab === 'health' && (
        <div className="space-y-5">
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

          <section className="rounded-2xl bg-white dark:bg-[#11231B] border border-slate-200/80 dark:border-[#244737] p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-extrabold text-base text-slate-800 dark:text-white flex items-center gap-2">
                  <i className="fa-solid fa-clock text-[#00744B] dark:text-emerald-400" />
                  งานตั้งเวลารีเฟรชสถานะรายวันอัตโนมัติ (<code>pg_cron</code>)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  เทียบเท่า Trigger เที่ยงคืนของ Ex Project — เรียก <code>vehicleapp.fn_refresh_vehicle_statuses()</code> ทุกวัน 00:00 น. เวลาไทย (<code>0 17 * * *</code> UTC)
                </p>
              </div>
              <button
                type="button"
                onClick={() => void refetchCron()}
                className="bma-btn-outline text-xs py-1.5"
              >
                <i className="fa-solid fa-rotate" />
                <span>ตรวจสอบสถานะ</span>
              </button>
            </div>

            {cronStatus ? (
              <div className="rounded-xl bg-slate-50 dark:bg-[#163024] border border-slate-200/80 dark:border-[#244737] p-4 text-xs space-y-1.5">
                <p>
                  <strong>Extension <code>pg_cron</code>:</strong>{' '}
                  {cronStatus.installed ? (
                    <span className="text-emerald-700 dark:text-emerald-300 font-bold">ติดตั้งแล้ว</span>
                  ) : (
                    <span className="text-amber-700 dark:text-amber-300 font-bold">
                      ยังไม่ได้เปิดใช้งาน (สามารถเปิดได้ที่ Supabase Dashboard → Database → Extensions → pg_cron แล้วรัน Migration 004 ซ้ำ)
                    </span>
                  )}
                </p>
                <p>
                  <strong>Job:</strong> <code>{cronStatus.jobname}</code> ·{' '}
                  <strong>Schedule:</strong> <code>{cronStatus.schedule || '-'}</code> ·{' '}
                  <strong>สถานะ:</strong>{' '}
                  {cronStatus.active ? (
                    <span className="text-emerald-700 dark:text-emerald-300 font-bold">Active</span>
                  ) : (
                    <span className="text-slate-500 font-bold">Inactive (วิว <code>v_vehicles_enriched</code> คำนวณสถานะสดทุก Query อยู่แล้ว)</span>
                  )}
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-400">กำลังโหลดสถานะ pg_cron...</p>
            )}
          </section>
        </div>
      )}

      {/* Tab 5: Audit Logs */}
      {activeTab === 'audit' && (
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
