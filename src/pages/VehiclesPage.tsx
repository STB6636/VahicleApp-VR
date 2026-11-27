import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Swal from 'sweetalert2';
import { vehicleService } from '@/services/vehicleService';
import { QUERY_KEYS } from '@/lib/queryClient';
import { VehicleStatusBadge } from '@/components/common/VehicleStatusBadge';
import { VehicleFormModal } from '@/components/vehicles/VehicleFormModal';
import { VehicleDetailModal } from '@/components/vehicles/VehicleDetailModal';
import { ALL_VEHICLE_STATUS_ORDER, VEHICLE_STATUS_MAP } from '@/lib/vehicleStatus';
import { formatThaiDate } from '@/lib/thaiDate';
import { useAuthStore, isVehicleAdminOrAbove } from '@/stores/useAuthStore';
import { useUiStore } from '@/stores/useUiStore';
import type { VehicleEnrichedRow, VehicleStatusCode } from '@/types/vehicle.types';

type SortKey = 'status' | 'type' | 'expiry' | 'code';

export function VehiclesPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const showToast = useUiStore((s) => s.showToast);

  const user = useAuthStore((s) => s.user);
  const appPermission = useAuthStore((s) => s.appPermission);
  const canManage = isVehicleAdminOrAbove(user, appPermission);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get('status') || 'all');
  const [orgFilter, setOrgFilter] = useState('all');
  const [sortBy, setSortBy] = useState<SortKey>('status');
  const [groupedView, setGroupedView] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<VehicleEnrichedRow | null>(null);
  const [detailVehicle, setDetailVehicle] = useState<VehicleEnrichedRow | null>(null);

  useEffect(() => {
    const paramStatus = searchParams.get('status');
    if (paramStatus && ALL_VEHICLE_STATUS_ORDER.includes(paramStatus as VehicleStatusCode)) {
      setStatusFilter(paramStatus);
    }
  }, [searchParams]);

  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.vehicles,
    queryFn: vehicleService.listVehicles,
  });

  const { data: vehicleTypes = [] } = useQuery({
    queryKey: QUERY_KEYS.vehicleTypes,
    queryFn: vehicleService.listVehicleTypes,
  });

  const orgOptions = useMemo(() => {
    const set = new Set<string>();
    for (const v of vehicles) {
      set.add(v.department_name || v.office_name || 'ไม่ระบุส่วนราชการ');
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'th'));
  }, [vehicles]);

  const existingProvinces = useMemo(
    () =>
      Array.from(new Set(vehicles.map((v) => v.province).filter((p): p is string => Boolean(p)))).sort(),
    [vehicles]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = vehicles.filter((v) => {
      const st = v.computed_status_code || v.status_code;
      const org = v.department_name || v.office_name || 'ไม่ระบุส่วนราชการ';
      if (typeFilter !== 'all' && v.vehicle_type_code !== typeFilter) return false;
      if (statusFilter !== 'all' && st !== statusFilter) return false;
      if (orgFilter !== 'all' && org !== orgFilter) return false;
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
        v.office_name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });

    return list.sort((a, b) => {
      if (sortBy === 'status') {
        const pa = VEHICLE_STATUS_MAP[a.computed_status_code || a.status_code]?.priority ?? 99;
        const pb = VEHICLE_STATUS_MAP[b.computed_status_code || b.status_code]?.priority ?? 99;
        if (pa !== pb) return pa - pb;
      } else if (sortBy === 'type') {
        const cmp = (a.vehicle_type_name || '').localeCompare(b.vehicle_type_name || '', 'th');
        if (cmp !== 0) return cmp;
      } else if (sortBy === 'expiry') {
        const cmp = String(a.current_expiry_date || '9999-12-31').localeCompare(
          String(b.current_expiry_date || '9999-12-31')
        );
        if (cmp !== 0) return cmp;
      }
      return String(a.vehicle_code || '').localeCompare(String(b.vehicle_code || ''));
    });
  }, [vehicles, search, typeFilter, statusFilter, orgFilter, sortBy]);

  const groupedByOrgAndType = useMemo(() => {
    const orgMap = new Map<string, Map<string, VehicleEnrichedRow[]>>();
    for (const v of filtered) {
      const org = v.department_name || v.office_name || 'ไม่ระบุส่วนราชการ';
      const typeName = v.vehicle_type_name || 'ไม่ระบุประเภท';
      if (!orgMap.has(org)) orgMap.set(org, new Map());
      const typeMap = orgMap.get(org)!;
      if (!typeMap.has(typeName)) typeMap.set(typeName, []);
      typeMap.get(typeName)!.push(v);
    }
    return Array.from(orgMap.entries())
      .sort(([a], [b]) => a.localeCompare(b, 'th'))
      .map(([org, typeMap]) => ({
        org,
        types: Array.from(typeMap.entries())
          .sort(([a], [b]) => a.localeCompare(b, 'th'))
          .map(([typeName, rows]) => ({ typeName, rows })),
      }));
  }, [filtered]);

  const handleOpenAdd = () => {
    setEditingVehicle(null);
    setFormOpen(true);
  };

  const handleOpenEdit = (v: VehicleEnrichedRow) => {
    setEditingVehicle(v);
    setFormOpen(true);
  };

  const handleDelete = async (v: VehicleEnrichedRow) => {
    const confirm = await Swal.fire({
      icon: 'warning',
      title: 'ยืนยันการลบข้อมูลยานพาหนะ?',
      html: `<p style="font-size:14px;">ต้องการลบ <strong>${v.vehicle_label}</strong> (${v.vehicle_code}) ออกจากทะเบียนหรือไม่?<br/><span style="color:#be123c;font-size:12px;">ประวัติกิจกรรมทั้งหมดของยานพาหนะรายการนี้จะถูกลบไปด้วย</span></p>`,
      showCancelButton: true,
      confirmButtonText: 'ยืนยันลบข้อมูล',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#dc2626',
      reverseButtons: true,
    });
    if (!confirm.isConfirmed) return;

    try {
      await vehicleService.deleteVehicle(v.id, {
        vehicle_code: v.vehicle_code,
        vehicle_label: v.vehicle_label,
      });
      showToast(`ลบยานพาหนะ ${v.vehicle_label} เรียบร้อยแล้ว`, 'success');
      await Promise.all([
        qc.invalidateQueries({ queryKey: QUERY_KEYS.vehicles }),
        qc.invalidateQueries({ queryKey: QUERY_KEYS.activities() }),
        qc.invalidateQueries({ queryKey: QUERY_KEYS.schemaHealth }),
      ]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'ไม่สามารถลบยานพาหนะได้', 'error');
    }
  };

  const renderTable = (rows: VehicleEnrichedRow[]) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="bg-slate-50 dark:bg-[#163024] text-xs font-bold text-slate-600 dark:text-emerald-200">
          <tr>
            <th className="px-4 py-3">รหัส</th>
            <th className="px-4 py-3">ประเภท / ทะเบียน</th>
            <th className="px-4 py-3">ผู้ดูแล / ตำแหน่ง</th>
            {!groupedView && <th className="px-4 py-3">ส่วนราชการ</th>}
            <th className="px-4 py-3">วันสิ้นอายุ</th>
            <th className="px-4 py-3">สถานะ</th>
            <th className="px-4 py-3 text-right">คำสั่ง</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-[#244737]">
          {rows.map((v) => {
            const st = v.computed_status_code || v.status_code;
            return (
              <tr key={v.id} className="hover:bg-slate-50/70 dark:hover:bg-white/5">
                <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">
                  {v.vehicle_code}
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setDetailVehicle(v)}
                    className="text-left group"
                  >
                    <p className="font-bold text-slate-800 dark:text-white group-hover:text-[#00744B] dark:group-hover:text-emerald-300">
                      {v.vehicle_label}
                    </p>
                    <p className="text-xs text-slate-500">
                      {v.vehicle_type_name}
                      {v.brand ? ` · ${v.brand} ${v.model || ''}` : ''}
                    </p>
                  </button>
                </td>
                <td className="px-4 py-3">
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                    {v.caretaker_name || '-'}
                  </p>
                  {(v.caretaker_position_display || v.caretaker_position) && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {v.caretaker_position_display || v.caretaker_position}
                    </p>
                  )}
                </td>
                {!groupedView && (
                  <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                    {v.department_name || v.office_name || '-'}
                  </td>
                )}
                <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                  {formatThaiDate(v.current_expiry_date)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <VehicleStatusBadge status={st} />
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setDetailVehicle(v)}
                      title="ดูรายละเอียด"
                      className="w-8 h-8 rounded-lg border border-slate-200 dark:border-[#244737] hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center text-xs transition"
                    >
                      <i className="fa-regular fa-eye" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        navigate('/activities', { state: { preselectedVehicleId: v.id } })
                      }
                      title="บันทึกต่อภาษี / ซ่อมบำรุง"
                      className="w-8 h-8 rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-[#00744B] dark:text-emerald-300 flex items-center justify-center text-xs transition"
                    >
                      <i className="fa-solid fa-clipboard-check" />
                    </button>
                    {v.latest_file_url && (
                      <a
                        href={v.latest_file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="เปิดเอกสารแนบล่าสุด"
                        className="w-8 h-8 rounded-lg border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 text-sky-700 dark:text-sky-300 flex items-center justify-center text-xs transition"
                      >
                        <i className="fa-solid fa-paperclip" />
                      </a>
                    )}
                    {canManage && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(v)}
                          title="แก้ไขข้อมูล"
                          className="w-8 h-8 rounded-lg border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center text-xs transition"
                        >
                          <i className="fa-solid fa-pen" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(v)}
                          title="ลบข้อมูล"
                          className="w-8 h-8 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center text-xs transition"
                        >
                          <i className="fa-solid fa-trash-can" />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Filter Toolbar */}
      <div className="rounded-2xl bg-white dark:bg-[#11231B] border border-slate-200/80 dark:border-[#244737] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 flex-1">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ค้นหาทะเบียน, ชื่อเรือ, ยี่ห้อ, ผู้ดูแล..."
                className="bma-input pl-9 text-xs"
              />
            </div>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bma-input w-auto text-xs"
            >
              <option value="all">ทุกประเภทยานพาหนะ</option>
              {vehicleTypes.map((vt) => (
                <option key={vt.id} value={vt.code}>
                  {vt.name_th}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => {
                const next = e.target.value;
                setStatusFilter(next);
                if (next === 'all') {
                  searchParams.delete('status');
                } else {
                  searchParams.set('status', next);
                }
                setSearchParams(searchParams, { replace: true });
              }}
              className="bma-input w-auto text-xs"
            >
              <option value="all">ทุกสถานะ</option>
              {ALL_VEHICLE_STATUS_ORDER.map((code) => (
                <option key={code} value={code}>
                  {VEHICLE_STATUS_MAP[code].labelTh}
                </option>
              ))}
            </select>

            {orgOptions.length > 1 && (
              <select
                value={orgFilter}
                onChange={(e) => setOrgFilter(e.target.value)}
                className="bma-input w-auto text-xs"
              >
                <option value="all">ทุกส่วนราชการ</option>
                {orgOptions.map((org) => (
                  <option key={org} value={org}>
                    {org}
                  </option>
                ))}
              </select>
            )}

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="bma-input w-auto text-xs"
            >
              <option value="status">เรียงตามสถานะเร่งด่วน</option>
              <option value="expiry">เรียงตามวันสิ้นอายุ</option>
              <option value="type">เรียงตามประเภท</option>
              <option value="code">เรียงตามรหัส (VH)</option>
            </select>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setGroupedView((prev) => !prev)}
              className="bma-btn-outline text-xs py-2"
              title="สลับมุมมองจัดกลุ่มตามส่วนราชการ / ตารางรวม"
            >
              <i className={`fa-solid ${groupedView ? 'fa-table-list' : 'fa-layer-group'}`} />
              <span className="hidden sm:inline">{groupedView ? 'มุมมองจัดกลุ่ม' : 'มุมมองตารางรวม'}</span>
            </button>

            {canManage && (
              <button type="button" onClick={handleOpenAdd} className="bma-btn-primary text-xs py-2">
                <i className="fa-solid fa-plus" />
                <span>เพิ่มยานพาหนะ</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>
            แสดง <strong>{filtered.length}</strong> รายการ จากทั้งหมด {vehicles.length} รายการ
          </span>
          {(search || typeFilter !== 'all' || statusFilter !== 'all' || orgFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setTypeFilter('all');
                setStatusFilter('all');
                setOrgFilter('all');
                searchParams.delete('status');
                setSearchParams(searchParams, { replace: true });
              }}
              className="text-emerald-700 dark:text-emerald-400 font-bold hover:underline"
            >
              ล้างตัวกรองทั้งหมด
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="rounded-2xl bg-white dark:bg-[#11231B] border border-slate-200/80 dark:border-[#244737] py-14 text-center text-sm text-slate-400">
          <i className="fa-solid fa-spinner fa-spin mr-2" />
          กำลังโหลดทะเบียนยานพาหนะ...
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-[#11231B] border border-slate-200/80 dark:border-[#244737] py-14 text-center text-sm text-slate-400">
          <i className="fa-solid fa-car-side text-2xl opacity-40 mb-2 block" />
          ไม่พบข้อมูลยานพาหนะตามเงื่อนไขที่เลือก
        </div>
      ) : groupedView ? (
        <div className="space-y-5">
          {groupedByOrgAndType.map((orgGroup) => (
            <section
              key={orgGroup.org}
              className="rounded-2xl bg-white dark:bg-[#11231B] border border-slate-200/80 dark:border-[#244737] shadow-xs overflow-hidden"
            >
              <div className="px-5 py-3.5 bg-gradient-to-r from-[#00744B]/10 to-transparent border-b border-slate-200/80 dark:border-[#244737] flex items-center justify-between">
                <h2 className="font-extrabold text-sm text-[#00744B] dark:text-emerald-300 flex items-center gap-2">
                  <i className="fa-solid fa-building" />
                  <span>ส่วนราชการ: {orgGroup.org}</span>
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/15 text-[#00744B] dark:text-emerald-300">
                  {orgGroup.types.reduce((sum, t) => sum + t.rows.length, 0)} คัน/ลำ
                </span>
              </div>

              <div className="divide-y divide-slate-200/70 dark:divide-[#244737]">
                {orgGroup.types.map((tGroup) => (
                  <div key={tGroup.typeName}>
                    <div className="px-5 py-2 bg-slate-50/90 dark:bg-[#163024]/80 flex items-center justify-between text-xs font-bold text-slate-600 dark:text-emerald-200">
                      <span>ประเภท: {tGroup.typeName}</span>
                      <span>{tGroup.rows.length} รายการ</span>
                    </div>
                    {renderTable(tGroup.rows)}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl bg-white dark:bg-[#11231B] border border-slate-200/80 dark:border-[#244737] overflow-hidden shadow-xs">
          {renderTable(filtered)}
        </div>
      )}

      {/* Modals */}
      <VehicleFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editingVehicle={editingVehicle}
        vehicleTypes={vehicleTypes}
        existingProvinces={existingProvinces}
      />

      <VehicleDetailModal
        vehicle={detailVehicle}
        onClose={() => setDetailVehicle(null)}
        canManage={canManage}
        onEdit={handleOpenEdit}
        onRecordActivity={(v) =>
          navigate('/activities', { state: { preselectedVehicleId: v.id } })
        }
      />
    </div>
  );
}
