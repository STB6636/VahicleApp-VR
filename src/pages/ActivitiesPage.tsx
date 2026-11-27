import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { vehicleService } from '@/services/vehicleService';
import { useAppSettings } from '@/hooks/useAppSettings';
import { QUERY_KEYS } from '@/lib/queryClient';
import { ACTIVITY_TYPE_LIST } from '@/lib/vehicleStatus';
import { VehicleStatusBadge } from '@/components/common/VehicleStatusBadge';
import { ActivityRecordModal } from '@/components/activities/ActivityRecordModal';
import { ActivityDetailModal } from '@/components/activities/ActivityDetailModal';
import { ActivityEditModal } from '@/components/activities/ActivityEditModal';
import { formatThaiDate, formatThaiDateTime } from '@/lib/thaiDate';
import { useAuthStore, isVehicleAdminOrAbove } from '@/stores/useAuthStore';
import type { VehicleActivityRow, VehicleEnrichedRow } from '@/types/vehicle.types';

export function ActivitiesPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const appPermission = useAuthStore((s) => s.appPermission);
  const canEdit = isVehicleAdminOrAbove(user, appPermission);
  const { settings } = useAppSettings(true);
  const pageSize = settings.activitiesPageSize;

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [page, setPage] = useState(1);

  const [recordOpen, setRecordOpen] = useState(false);
  const [preselectedVehicleId, setPreselectedVehicleId] = useState<string | null>(null);
  const [detailActivity, setDetailActivity] = useState<VehicleActivityRow | null>(null);
  const [editActivity, setEditActivity] = useState<VehicleActivityRow | null>(null);

  // Support navigation state from Dashboard / VehiclesPage / NotificationBell
  useEffect(() => {
    const state = location.state as {
      preselectedVehicleId?: string;
      openRecordModal?: boolean;
    } | null;
    if (state?.preselectedVehicleId) {
      setPreselectedVehicleId(state.preselectedVehicleId);
      setRecordOpen(true);
      navigate(location.pathname, { replace: true, state: null });
    } else if (state?.openRecordModal) {
      setPreselectedVehicleId(null);
      setRecordOpen(true);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate]);

  const { data: activities = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.activities(undefined, 200),
    queryFn: () => vehicleService.listRecentActivities(200),
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: QUERY_KEYS.vehicles,
    queryFn: vehicleService.listVehicles,
  });

  const { data: vehicleTypes = [] } = useQuery({
    queryKey: QUERY_KEYS.vehicleTypes,
    queryFn: vehicleService.listVehicleTypes,
  });

  const vehicleMap = useMemo(() => {
    const map = new Map<string, VehicleEnrichedRow>();
    for (const v of vehicles) map.set(v.id, v);
    return map;
  }, [vehicles]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activities.filter((act) => {
      if (typeFilter !== 'all' && act.activity_type !== typeFilter) return false;
      if (!q) return true;
      const v = vehicleMap.get(act.vehicle_id);
      const hay = [
        act.activity_code,
        act.activity_label_th,
        act.document_no,
        act.location,
        act.details,
        act.recorded_by_name,
        v?.vehicle_code,
        v?.vehicle_label,
        v?.vehicle_type_name,
        v?.department_name,
        v?.office_name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [activities, typeFilter, search, vehicleMap]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage, pageSize]);

  return (
    <div className="space-y-4">
      {/* Action Header */}
      <div className="rounded-2xl bg-white dark:bg-[#11231B] border border-slate-200/80 dark:border-[#244737] p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-extrabold text-base text-slate-800 dark:text-white">
            บันทึกต่ออายุภาษี ซ่อมบำรุง ยุบสภาพ และจำหน่าย
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            รองรับการบันทึกแบบ 1 คัน หรือเลือกหลายคันพร้อมกันแบบ Batch (Atomic Transaction)
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setPreselectedVehicleId(null);
            setRecordOpen(true);
          }}
          className="bma-btn-primary text-xs"
        >
          <i className="fa-solid fa-plus" />
          <span>บันทึกกิจกรรมใหม่</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="rounded-2xl bg-white dark:bg-[#11231B] border border-slate-200/80 dark:border-[#244737] p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="ค้นหารหัส, ทะเบียน/ชื่อเรือ, เอกสาร, สังกัด, ผู้บันทึก..."
              className="bma-input pl-9 text-xs"
            />
          </div>

          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
            className="bma-input w-auto text-xs"
          >
            <option value="all">ทุกประเภทรายการ</option>
            {ACTIVITY_TYPE_LIST.map((t) => (
              <option key={t.code} value={t.code}>
                {t.labelTh}
              </option>
            ))}
          </select>
        </div>

        <span className="text-xs text-slate-500 dark:text-slate-400">
          พบ <strong>{filtered.length}</strong> รายการ
        </span>
      </div>

      {/* History Table */}
      <div className="rounded-2xl bg-white dark:bg-[#11231B] border border-slate-200/80 dark:border-[#244737] overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-slate-400">
              <i className="fa-solid fa-spinner fa-spin mr-2" />
              กำลังโหลดประวัติกิจกรรม...
            </div>
          ) : paginated.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">
              ไม่พบประวัติการทำรายการตามเงื่อนไขที่เลือก
            </div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 dark:bg-[#163024] text-xs font-bold text-slate-600 dark:text-emerald-200">
                <tr>
                  <th className="px-4 py-3">รหัส / ประเภทรายการ</th>
                  <th className="px-4 py-3">ยานพาหนะ / สังกัด</th>
                  <th className="px-4 py-3">เอกสาร / วันสิ้นอายุใหม่</th>
                  <th className="px-4 py-3">สถานะใหม่</th>
                  <th className="px-4 py-3">ผู้บันทึก / เวลา</th>
                  <th className="px-4 py-3 text-right">คำสั่ง</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#244737]">
                {paginated.map((act) => {
                  const v = vehicleMap.get(act.vehicle_id);
                  return (
                    <tr key={act.id} className="hover:bg-slate-50/70 dark:hover:bg-white/5">
                      <td className="px-4 py-3">
                        <p className="font-bold text-slate-800 dark:text-white text-xs">
                          {act.activity_label_th}
                        </p>
                        <p className="font-mono text-[11px] text-slate-400">{act.activity_code}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-bold text-xs text-slate-800 dark:text-white">
                          {v ? `[${v.vehicle_type_name}] ${v.vehicle_label}` : act.vehicle_id}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {v ? v.department_name || v.office_name || '-' : '-'}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <p className="font-semibold text-slate-700 dark:text-slate-200">
                          {act.document_no || '-'}
                        </p>
                        {act.expiry_date && (
                          <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                            สิ้นอายุใหม่: {formatThaiDate(act.expiry_date)}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {act.new_status ? <VehicleStatusBadge status={act.new_status} /> : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                          {act.recorded_by_name}
                        </p>
                        <p className="font-mono text-[11px] text-slate-400">
                          {formatThaiDateTime(act.recorded_at)}
                        </p>
                        {act.updated_by_name && (
                          <p className="text-[10px] text-amber-600 dark:text-amber-400">
                            แก้ไขโดย {act.updated_by_name}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setDetailActivity(act)}
                            title="ดูรายละเอียด"
                            className="w-8 h-8 rounded-lg border border-slate-200 dark:border-[#244737] hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center text-xs transition"
                          >
                            <i className="fa-regular fa-eye" />
                          </button>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => setEditActivity(act)}
                              title="แก้ไขข้อมูลประวัติ"
                              className="w-8 h-8 rounded-lg border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center text-xs transition"
                            >
                              <i className="fa-solid fa-pen" />
                            </button>
                          )}
                          {act.file_url && (
                            <a
                              href={act.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="ดูไฟล์หลักฐาน"
                              className="w-8 h-8 rounded-lg border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 text-sky-700 dark:text-sky-300 flex items-center justify-center text-xs transition"
                            >
                              <i className="fa-solid fa-paperclip" />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-slate-200/80 dark:border-[#244737] flex items-center justify-between text-xs">
            <span className="text-slate-500">
              หน้า {safePage} / {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="bma-btn-outline py-1 px-3 text-xs"
              >
                &laquo; ก่อนหน้า
              </button>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="bma-btn-outline py-1 px-3 text-xs"
              >
                ถัดไป &raquo;
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <ActivityRecordModal
        open={recordOpen}
        onClose={() => {
          setRecordOpen(false);
          setPreselectedVehicleId(null);
        }}
        vehicles={vehicles}
        vehicleTypes={vehicleTypes}
        preselectedVehicleId={preselectedVehicleId}
      />

      <ActivityDetailModal
        activity={detailActivity}
        vehicle={detailActivity ? vehicleMap.get(detailActivity.vehicle_id) : null}
        onClose={() => setDetailActivity(null)}
        canEdit={canEdit}
        onEdit={(act) => setEditActivity(act)}
      />

      <ActivityEditModal
        activity={editActivity}
        vehicle={editActivity ? vehicleMap.get(editActivity.vehicle_id) : null}
        onClose={() => setEditActivity(null)}
      />
    </div>
  );
}
