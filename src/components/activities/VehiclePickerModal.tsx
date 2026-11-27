import { useMemo, useState } from 'react';
import { ResponsiveModal } from '@/components/common/ResponsiveModal';
import { VehicleStatusBadge } from '@/components/common/VehicleStatusBadge';
import { formatThaiDate } from '@/lib/thaiDate';
import type { VehicleEnrichedRow, VehicleTypeRow } from '@/types/vehicle.types';

export interface VehiclePickerModalProps {
  open: boolean;
  onClose: () => void;
  mode: 'single' | 'multi';
  vehicles: VehicleEnrichedRow[];
  vehicleTypes: VehicleTypeRow[];
  selectedIds: string[];
  onConfirm: (selectedIds: string[]) => void;
}

export function VehiclePickerModal({
  open,
  onClose,
  mode,
  vehicles,
  vehicleTypes,
  selectedIds,
  onConfirm,
}: VehiclePickerModalProps) {
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [draftIds, setDraftIds] = useState<string[]>(selectedIds);

  // Sync draft when modal opens
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setDraftIds(selectedIds);
      setSearch('');
      setDeptFilter('all');
      setTypeFilter('all');
    }
  }

  const departments = useMemo(() => {
    const names = new Set<string>();
    for (const v of vehicles) {
      const label = v.department_name || v.office_name || 'ไม่ระบุสังกัด';
      names.add(label);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'th'));
  }, [vehicles]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vehicles.filter((v) => {
      if (typeFilter !== 'all' && v.vehicle_type_code !== typeFilter) return false;
      const orgName = v.department_name || v.office_name || 'ไม่ระบุสังกัด';
      if (deptFilter !== 'all' && orgName !== deptFilter) return false;
      if (!q) return true;
      const hay = [
        v.vehicle_code,
        v.vehicle_label,
        v.license_plate,
        v.vessel_name,
        v.vessel_license_no,
        v.caretaker_name,
        orgName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [vehicles, search, deptFilter, typeFilter]);

  const toggleId = (id: string) => {
    if (mode === 'single') {
      onConfirm([id]);
      onClose();
      return;
    }
    setDraftIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectAllFiltered = () => {
    const next = new Set(draftIds);
    for (const v of filtered) next.add(v.id);
    setDraftIds(Array.from(next));
  };

  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      title={mode === 'multi' ? 'เลือกยานพาหนะหลายรายการ (Batch)' : 'ค้นหาและเลือกยานพาหนะ'}
      subtitle={`พบยานพาหนะที่มีสิทธิ์ดำเนินการ ${filtered.length} จาก ${vehicles.length} รายการ`}
      icon="fa-magnifying-glass"
      size="lg"
      footer={
        mode === 'multi' ? (
          <>
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300 mr-auto">
              เลือกแล้ว {draftIds.length} รายการ
            </span>
            <button type="button" onClick={onClose} className="bma-btn-outline">
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={() => {
                onConfirm(draftIds);
                onClose();
              }}
              className="bma-btn-primary"
            >
              <i className="fa-solid fa-check" />
              <span>ยืนยันรายการที่เลือก ({draftIds.length})</span>
            </button>
          </>
        ) : (
          <button type="button" onClick={onClose} className="bma-btn-outline">
            ปิด
          </button>
        )
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div className="relative">
            <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาทะเบียน, ชื่อเรือ, ผู้ดูแล..."
              className="bma-input pl-8 text-xs"
            />
          </div>
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="bma-input text-xs"
          >
            <option value="all">ทุกส่วนราชการ</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bma-input text-xs"
          >
            <option value="all">ทุกประเภท</option>
            {vehicleTypes.map((vt) => (
              <option key={vt.id} value={vt.code}>
                {vt.name_th}
              </option>
            ))}
          </select>
        </div>

        {mode === 'multi' && filtered.length > 0 && (
          <div className="flex items-center justify-end gap-3 text-xs">
            <button
              type="button"
              onClick={selectAllFiltered}
              className="font-bold text-[#00744B] dark:text-emerald-400 hover:underline"
            >
              เลือกทั้งหมดที่กรอง ({filtered.length})
            </button>
            {draftIds.length > 0 && (
              <button
                type="button"
                onClick={() => setDraftIds([])}
                className="font-bold text-rose-600 dark:text-rose-400 hover:underline"
              >
                ล้างที่เลือกทั้งหมด
              </button>
            )}
          </div>
        )}

        <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-[#244737] rounded-xl border border-slate-200 dark:border-[#244737]">
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">
              ไม่พบยานพาหนะที่ตรงตามเงื่อนไขและสถานะของรายการนี้
            </div>
          ) : (
            filtered.map((v) => {
              const checked = draftIds.includes(v.id);
              const status = v.computed_status_code || v.status_code;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => toggleId(v.id)}
                  className={`w-full text-left px-3.5 py-2.5 flex items-center gap-3 transition hover:bg-slate-50 dark:hover:bg-white/5 ${
                    checked ? 'bg-emerald-50/70 dark:bg-emerald-950/40' : ''
                  }`}
                >
                  {mode === 'multi' ? (
                    <span
                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 text-[10px] ${
                        checked
                          ? 'bg-[#00744B] border-[#00744B] text-white'
                          : 'border-slate-300 dark:border-slate-600'
                      }`}
                    >
                      {checked && <i className="fa-solid fa-check" />}
                    </span>
                  ) : (
                    <span className="w-7 h-7 rounded-lg bg-emerald-500/12 text-[#00744B] dark:text-emerald-300 flex items-center justify-center shrink-0 text-xs">
                      <i className={`fa-solid ${v.is_vessel ? 'fa-ship' : 'fa-car-side'}`} />
                    </span>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-extrabold text-slate-800 dark:text-white truncate">
                        {v.vehicle_label}
                      </p>
                      <span className="font-mono text-[10px] text-slate-400">{v.vehicle_code}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {v.vehicle_type_name} · {v.department_name || v.office_name || '-'} · สิ้นอายุ{' '}
                      {formatThaiDate(v.current_expiry_date)}
                    </p>
                  </div>

                  <VehicleStatusBadge status={status} />
                </button>
              );
            })
          )}
        </div>
      </div>
    </ResponsiveModal>
  );
}
