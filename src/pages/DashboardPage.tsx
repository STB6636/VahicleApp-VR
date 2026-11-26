import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { vehicleService } from '@/services/vehicleService';
import { QUERY_KEYS } from '@/lib/queryClient';
import { VEHICLE_STATUS_MAP } from '@/lib/vehicleStatus';
import { VehicleStatusBadge } from '@/components/common/VehicleStatusBadge';
import { formatThaiDate } from '@/lib/thaiDate';
import type { VehicleStatusCode } from '@/types/vehicle.types';

const STATUS_CARDS: Array<{ key: VehicleStatusCode | 'TOTAL'; label: string; icon: string; accent: string }> = [
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

export function DashboardPage() {
  const navigate = useNavigate();
  const { data: vehicles = [], isLoading, error } = useQuery({
    queryKey: QUERY_KEYS.vehicles,
    queryFn: vehicleService.listVehicles,
  });

  const counts = vehicles.reduce<Record<string, number>>((acc, v) => {
    const st = v.computed_status_code || v.status_code;
    acc[st] = (acc[st] || 0) + 1;
    return acc;
  }, {});

  const trackingVehicles = vehicles
    .filter((v) => VEHICLE_STATUS_MAP[v.computed_status_code || v.status_code]?.needsTracking)
    .sort((a, b) => {
      const pa = VEHICLE_STATUS_MAP[a.computed_status_code || a.status_code]?.priority ?? 99;
      const pb = VEHICLE_STATUS_MAP[b.computed_status_code || b.status_code]?.priority ?? 99;
      if (pa !== pb) return pa - pb;
      return String(a.current_expiry_date || '').localeCompare(String(b.current_expiry_date || ''));
    })
    .slice(0, 15);

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

      {/* 9 Status KPI Cards matching Ex Project + Portal SSO-VR Card Aesthetic */}
      <section className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3.5">
        {STATUS_CARDS.map((card) => {
          const val = card.key === 'TOTAL' ? vehicles.length : counts[card.key] || 0;
          return (
            <div
              key={card.key}
              className="rounded-2xl bg-white dark:bg-[#11231B] border border-slate-200/80 dark:border-[#244737] p-4 shadow-xs flex items-center justify-between gap-3"
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
            </div>
          );
        })}
      </section>

      {/* Tracking Queue */}
      <section className="rounded-2xl bg-white dark:bg-[#11231B] border border-slate-200/80 dark:border-[#244737] shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200/80 dark:border-[#244737] flex items-center justify-between gap-3">
          <div>
            <h2 className="font-extrabold text-base text-slate-800 dark:text-white">
              รายการที่ต้องติดตามเร่งด่วน
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              แสดงยานพาหนะสถานะขาดต่ออายุ กำลังจะขาดต่ออายุ และซ่อมบำรุง (สูงสุด 15 รายการ)
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/activities')}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#00744B] to-[#00A368] text-white text-xs font-bold shadow-xs hover:opacity-95 transition"
          >
            <i className="fa-solid fa-plus mr-1.5" />
            บันทึกต่ออายุ / กิจกรรม
          </button>
        </div>

        <div className="overflow-x-auto">
          {trackingVehicles.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">
              <i className="fa-solid fa-circle-check text-2xl text-emerald-500/60 mb-2 block" />
              ยังไม่มีรายการยานพาหนะที่ต้องติดตามในขณะนี้
            </div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 dark:bg-[#163024] text-xs font-bold text-slate-600 dark:text-emerald-200">
                <tr>
                  <th className="px-4 py-3">ประเภท / ทะเบียน</th>
                  <th className="px-4 py-3">ผู้ดูแล</th>
                  <th className="px-4 py-3">ส่วนราชการ</th>
                  <th className="px-4 py-3">วันสิ้นอายุ</th>
                  <th className="px-4 py-3">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#244737]">
                {trackingVehicles.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50/70 dark:hover:bg-white/5">
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-800 dark:text-white">{v.vehicle_label}</p>
                      <p className="text-xs text-slate-500">{v.vehicle_type_name}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                      {v.caretaker_name || '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {v.department_name || v.office_name || '-'}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {formatThaiDate(v.current_expiry_date)}
                    </td>
                    <td className="px-4 py-3">
                      <VehicleStatusBadge status={v.computed_status_code || v.status_code} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
