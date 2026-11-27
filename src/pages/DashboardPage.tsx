import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { vehicleService } from '@/services/vehicleService';
import { useAppSettings } from '@/hooks/useAppSettings';
import { QUERY_KEYS } from '@/lib/queryClient';
import { VEHICLE_STATUS_MAP } from '@/lib/vehicleStatus';
import { formatVehicleCaretakerPositionLevel } from '@/lib/caretakerFormatter';
import { VehicleStatusBadge } from '@/components/common/VehicleStatusBadge';
import { VehicleDetailModal } from '@/components/vehicles/VehicleDetailModal';
import { formatThaiDate, formatThaiDateTime } from '@/lib/thaiDate';
import { useAuthStore, isVehicleAdminOrAbove } from '@/stores/useAuthStore';
import type { VehicleEnrichedRow, VehicleStatusCode } from '@/types/vehicle.types';

const STATUS_CARDS: Array<{
  key: VehicleStatusCode | 'TOTAL';
  label: string;
  icon: string;
  accent: string;
}> = [
  { key: 'TOTAL', label: 'ทั้งหมด', icon: 'fa-layer-group', accent: 'text-emerald-600 bg-emerald-500/12' },
  { key: 'NORMAL', label: 'ปกติ', icon: 'fa-circle-check', accent: 'text-emerald-600 bg-emerald-500/12' },
  { key: 'WARNING', label: 'กำลังจะหมดอายุ', icon: 'fa-clock', accent: 'text-amber-600 bg-amber-500/15' },
  { key: 'MAINTENANCE_WARNING', label: 'ซ่อมฯ/กำลังหมดอายุ', icon: 'fa-screwdriver-wrench', accent: 'text-amber-600 bg-amber-500/15' },
  { key: 'EXPIRED', label: 'สิ้นอายุแล้ว', icon: 'fa-circle-exclamation', accent: 'text-rose-600 bg-rose-500/15' },
  { key: 'MAINTENANCE_EXPIRED', label: 'ซ่อมฯ/สิ้นอายุแล้ว', icon: 'fa-wrench', accent: 'text-rose-600 bg-rose-500/15' },
  { key: 'MAINTENANCE', label: 'ซ่อมบำรุง', icon: 'fa-tools', accent: 'text-sky-600 bg-sky-500/15' },
  { key: 'DECOMMISSIONED', label: 'ยุบสภาพรอจำหน่าย', icon: 'fa-box-archive', accent: 'text-slate-600 bg-slate-500/15' },
  { key: 'DISPOSED', label: 'จำหน่าย', icon: 'fa-ban', accent: 'text-slate-500 bg-slate-500/15' },
];

const URGENT_GROUP_ORDER: VehicleStatusCode[] = [
  'EXPIRED',
  'MAINTENANCE_EXPIRED',
  'WARNING',
  'MAINTENANCE_WARNING',
  'MAINTENANCE',
];

export function DashboardPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const appPermission = useAuthStore((s) => s.appPermission);
  const canManage = isVehicleAdminOrAbove(user, appPermission);

  const { settings } = useAppSettings(true);
  const [detailVehicle, setDetailVehicle] = useState<VehicleEnrichedRow | null>(null);

  const { data: vehicles = [], isLoading, error } = useQuery({
    queryKey: QUERY_KEYS.vehicles,
    queryFn: vehicleService.listVehicles,
  });

  const { data: recentActivities = [] } = useQuery({
    queryKey: QUERY_KEYS.activities(undefined, 50),
    queryFn: () => vehicleService.listRecentActivities(50),
  });

  const vehicleMap = useMemo(() => {
    const map = new Map<string, VehicleEnrichedRow>();
    for (const v of vehicles) map.set(v.id, v);
    return map;
  }, [vehicles]);

  const counts = useMemo(
    () =>
      vehicles.reduce<Record<string, number>>((acc, v) => {
        const st = v.computed_status_code || v.status_code;
        acc[st] = (acc[st] || 0) + 1;
        return acc;
      }, {}),
    [vehicles]
  );

  // Urgent tracking queue grouped by the 5 urgent statuses (mirrors Ex Project view-dashboard)
  const groupedTracking = useMemo(() => {
    const urgent = vehicles
      .filter((v) => VEHICLE_STATUS_MAP[v.computed_status_code || v.status_code]?.needsTracking)
      .sort((a, b) => {
        const pa = VEHICLE_STATUS_MAP[a.computed_status_code || a.status_code]?.priority ?? 99;
        const pb = VEHICLE_STATUS_MAP[b.computed_status_code || b.status_code]?.priority ?? 99;
        if (pa !== pb) return pa - pb;
        return String(a.current_expiry_date || '').localeCompare(String(b.current_expiry_date || ''));
      })
      .slice(0, settings.dashboardTrackingLimit);

    const groups: Array<{ statusCode: VehicleStatusCode; labelTh: string; rows: VehicleEnrichedRow[] }> = [];
    for (const code of URGENT_GROUP_ORDER) {
      const rows = urgent.filter((v) => (v.computed_status_code || v.status_code) === code);
      if (rows.length > 0) {
        groups.push({
          statusCode: code,
          labelTh: VEHICLE_STATUS_MAP[code].labelTh,
          rows,
        });
      }
    }
    return { total: urgent.length, groups };
  }, [vehicles, settings.dashboardTrackingLimit]);

  const latestActivities = useMemo(
    () => recentActivities.slice(0, settings.dashboardRecentLimit),
    [recentActivities, settings.dashboardRecentLimit]
  );

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/35 p-4 text-sm text-amber-800 dark:text-amber-200 flex items-start gap-3">
          <i className="fa-solid fa-triangle-exclamation mt-0.5" />
          <div>
            <p className="font-bold">ไม่สามารถโหลดข้อมูลจาก Schema <code>vehicleapp</code> ได้</p>
            <p className="text-xs mt-1 opacity-90">{error.message}</p>
          </div>
        </div>
      )}

      {/* 9 Status KPI Cards (clickable -> filter VehiclesPage) */}
      <section className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3.5">
        {STATUS_CARDS.map((card) => {
          const val = card.key === 'TOTAL' ? vehicles.length : counts[card.key] || 0;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() =>
                navigate(card.key === 'TOTAL' ? '/vehicles' : `/vehicles?status=${card.key}`)
              }
              className="text-left rounded-2xl bg-white dark:bg-[#11231B] border border-slate-200/80 dark:border-[#244737] p-4 shadow-xs hover:border-emerald-500/60 hover:-translate-y-0.5 transition flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 truncate">
                  {card.label}
                </p>
                <p className="text-2xl font-extrabold text-slate-800 dark:text-white mt-1">
                  {isLoading ? '—' : val}
                </p>
              </div>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${card.accent}`}>
                <i className={`fa-solid ${card.icon}`} />
              </div>
            </button>
          );
        })}
      </section>

      {/* Main Content Split: 5-Status Grouped Tracking Queue + Latest Activities */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <section className="xl:col-span-2 rounded-2xl bg-white dark:bg-[#11231B] border border-slate-200/80 dark:border-[#244737] shadow-xs overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200/80 dark:border-[#244737] flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-extrabold text-base text-slate-800 dark:text-white">
                รายการที่ต้องติดตามเร่งด่วน
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                จัดกลุ่มตาม 5 สถานะเร่งด่วน (แจ้งเตือนล่วงหน้า {settings.warningDaysBefore} วัน · แสดงสูงสุด{' '}
                {settings.dashboardTrackingLimit} รายการ)
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/activities', { state: { openRecordModal: true } })}
              className="bma-btn-primary text-xs"
            >
              <i className="fa-solid fa-plus" />
              <span>บันทึกต่ออายุ / กิจกรรม</span>
            </button>
          </div>

          {groupedTracking.total === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">
              <i className="fa-solid fa-circle-check text-2xl text-emerald-500/60 mb-2 block" />
              ยังไม่มีรายการยานพาหนะที่ต้องติดตามในขณะนี้
            </div>
          ) : (
            <div className="divide-y divide-slate-200/80 dark:divide-[#244737]">
              {groupedTracking.groups.map((grp) => (
                <div key={grp.statusCode}>
                  <div className="px-5 py-2.5 bg-slate-50/90 dark:bg-[#163024] flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <VehicleStatusBadge status={grp.statusCode} />
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                        {grp.rows.length} รายการ
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate(`/vehicles?status=${grp.statusCode}`)}
                      className="text-[11px] font-bold text-[#00744B] dark:text-emerald-400 hover:underline"
                    >
                      ดูทั้งหมดในกลุ่มนี้
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-white dark:bg-[#11231B] text-[11px] font-bold text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-[#244737]">
                        <tr>
                          <th className="px-4 py-2">ประเภท / ทะเบียน</th>
                          <th className="px-4 py-2">ผู้ดูแล / ตำแหน่ง+ระดับ</th>
                          <th className="px-4 py-2">ส่วนราชการ</th>
                          <th className="px-4 py-2">วันสิ้นอายุ</th>
                          <th className="px-4 py-2 text-right">ดำเนินการ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-[#244737]">
                        {grp.rows.map((v) => {
                          const posLevel = formatVehicleCaretakerPositionLevel(v);
                          return (
                            <tr key={v.id} className="hover:bg-slate-50/70 dark:hover:bg-white/5">
                              <td className="px-4 py-3">
                                <button
                                  type="button"
                                  onClick={() => setDetailVehicle(v)}
                                  className="text-left group"
                                >
                                  <p className="font-bold text-slate-800 dark:text-white group-hover:text-[#00744B] dark:group-hover:text-emerald-300">
                                    {v.vehicle_label}
                                  </p>
                                  <p className="text-xs text-slate-500">{v.vehicle_type_name}</p>
                                </button>
                              </td>
                              <td className="px-4 py-3">
                                <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                                  {v.caretaker_name || '-'}
                                </p>
                                {posLevel && (
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                    {posLevel}
                                  </p>
                                )}
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                                {v.department_name || v.office_name || '-'}
                              </td>
                              <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                                {formatThaiDate(v.current_expiry_date)}
                              </td>
                              <td className="px-4 py-3 text-right whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() =>
                                    navigate('/activities', { state: { preselectedVehicleId: v.id } })
                                  }
                                  className="px-2.5 py-1 rounded-lg bg-emerald-500/12 hover:bg-emerald-500/20 text-[#00744B] dark:text-emerald-300 text-xs font-bold transition"
                                >
                                  <i className="fa-solid fa-clipboard-check mr-1" />
                                  บันทึก
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Latest Activities */}
        <section className="rounded-2xl bg-white dark:bg-[#11231B] border border-slate-200/80 dark:border-[#244737] shadow-xs overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-200/80 dark:border-[#244737] flex items-center justify-between gap-2">
            <div>
              <h2 className="font-extrabold text-base text-slate-800 dark:text-white">
                กิจกรรมล่าสุด
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                รายการบันทึกล่าสุด {settings.dashboardRecentLimit} รายการ
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/activities')}
              className="text-xs font-bold text-[#00744B] dark:text-emerald-400 hover:underline"
            >
              ดูทั้งหมด
            </button>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-[#244737] flex-1">
            {latestActivities.length === 0 ? (
              <div className="py-12 px-4 text-center text-xs text-slate-400">
                ยังไม่มีประวัติการทำรายการ
              </div>
            ) : (
              latestActivities.map((act) => {
                const v = vehicleMap.get(act.vehicle_id);
                return (
                  <div key={act.id} className="px-4 py-3 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-extrabold text-slate-800 dark:text-white truncate">
                        {act.activity_label_th}
                      </p>
                      <span className="font-mono text-[10px] text-slate-400 shrink-0">
                        {act.activity_code}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 truncate">
                      {v ? `[${v.vehicle_type_name}] ${v.vehicle_label}` : act.vehicle_id}
                    </p>
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span className="truncate">{act.recorded_by_name}</span>
                      <span className="font-mono shrink-0">{formatThaiDateTime(act.recorded_at)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      <VehicleDetailModal
        vehicle={detailVehicle}
        onClose={() => setDetailVehicle(null)}
        canManage={canManage}
        onRecordActivity={(v) =>
          navigate('/activities', { state: { preselectedVehicleId: v.id } })
        }
      />
    </div>
  );
}
