import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { vehicleService } from '@/services/vehicleService';
import { QUERY_KEYS } from '@/lib/queryClient';
import { VehicleStatusBadge } from '@/components/common/VehicleStatusBadge';
import { formatThaiDate } from '@/lib/thaiDate';
import { useAuthStore, isVehicleAdminOrAbove } from '@/stores/useAuthStore';

export function VehiclesPage() {
  const user = useAuthStore((s) => s.user);
  const appPermission = useAuthStore((s) => s.appPermission);
  const canManage = isVehicleAdminOrAbove(user, appPermission);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.vehicles,
    queryFn: vehicleService.listVehicles,
  });

  const { data: vehicleTypes = [] } = useQuery({
    queryKey: QUERY_KEYS.vehicleTypes,
    queryFn: vehicleService.listVehicleTypes,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vehicles.filter((v) => {
      if (typeFilter !== 'all' && v.vehicle_type_code !== typeFilter) return false;
      if (!q) return true;
      const hay = [
        v.vehicle_code,
        v.vehicle_label,
        v.license_plate,
        v.province,
        v.vessel_name,
        v.vessel_license_no,
        v.brand,
        v.model,
        v.caretaker_name,
        v.department_name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [vehicles, search, typeFilter]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white dark:bg-[#11231B] border border-slate-200/80 dark:border-[#244737] p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาทะเบียน, ชื่อเรือ, ยี่ห้อ, ผู้ดูแล..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-[#244737] bg-slate-50 dark:bg-[#183025] text-sm outline-none focus:ring-2 focus:ring-emerald-500/30"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-[#244737] bg-slate-50 dark:bg-[#183025] text-sm"
          >
            <option value="all">ทุกประเภทยานพาหนะ</option>
            {vehicleTypes.map((vt) => (
              <option key={vt.id} value={vt.code}>
                {vt.name_th}
              </option>
            ))}
          </select>
        </div>

        {canManage && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/12 text-[#00744B] dark:text-emerald-300 text-xs font-bold">
            <i className="fa-solid fa-wrench" />
            <span>ฟอร์มเพิ่ม/แก้ไขยานพาหนะ (Phase 2)</span>
          </span>
        )}
      </div>

      <div className="rounded-2xl bg-white dark:bg-[#11231B] border border-slate-200/80 dark:border-[#244737] overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-slate-400">กำลังโหลดทะเบียนยานพาหนะ...</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">
              ไม่พบข้อมูลยานพาหนะใน Schema <code>vehicleapp</code>
            </div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 dark:bg-[#163024] text-xs font-bold text-slate-600 dark:text-emerald-200">
                <tr>
                  <th className="px-4 py-3">รหัส</th>
                  <th className="px-4 py-3">ประเภท / ทะเบียน</th>
                  <th className="px-4 py-3">ผู้ดูแล</th>
                  <th className="px-4 py-3">ส่วนราชการ</th>
                  <th className="px-4 py-3">วันสิ้นอายุ</th>
                  <th className="px-4 py-3">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#244737]">
                {filtered.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50/70 dark:hover:bg-white/5">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{v.vehicle_code}</td>
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-800 dark:text-white">{v.vehicle_label}</p>
                      <p className="text-xs text-slate-500">
                        {v.vehicle_type_name} {v.brand ? `· ${v.brand} ${v.model || ''}` : ''}
                      </p>
                    </td>
                    <td className="px-4 py-3">{v.caretaker_name || '-'}</td>
                    <td className="px-4 py-3">{v.department_name || v.office_name || '-'}</td>
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
      </div>
    </div>
  );
}
