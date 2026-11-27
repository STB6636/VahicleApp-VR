import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Swal from 'sweetalert2';
import { vehicleService } from '@/services/vehicleService';
import { portalDirectoryService } from '@/services/portalDirectoryService';
import { QUERY_KEYS } from '@/lib/queryClient';
import { ResponsiveModal } from '@/components/common/ResponsiveModal';
import { escapeHtml } from '@/lib/htmlUtils';
import { useUiStore } from '@/stores/useUiStore';
import type { VehicleTypeRow, VehicleTypeUpsertInput } from '@/types/vehicle.types';

const ICON_PRESETS = [
  { icon: 'fa-car-side', label: 'รถยนต์' },
  { icon: 'fa-motorcycle', label: 'รถจักรยานยนต์' },
  { icon: 'fa-truck', label: 'รถบรรทุก' },
  { icon: 'fa-van-shuttle', label: 'รถตู้' },
  { icon: 'fa-bus', label: 'รถโดยสาร' },
  { icon: 'fa-truck-pickup', label: 'รถกระบะ' },
  { icon: 'fa-ship', label: 'เรือราชการ' },
  { icon: 'fa-sailboat', label: 'เรือตรวจการณ์' },
  { icon: 'fa-tractor', label: 'เครื่องจักรกล' },
];

interface BatchRowDraft {
  code: string;
  name_th: string;
  is_vessel: boolean;
  default_caretaker_position: string;
  icon_name: string;
}

const emptyBatchRow = (): BatchRowDraft => ({
  code: '',
  name_th: '',
  is_vessel: false,
  default_caretaker_position: 'พนักงานขับรถยนต์',
  icon_name: 'fa-car-side',
});

export function SettingsVehicleTypesTab() {
  const qc = useQueryClient();
  const showToast = useUiStore((s) => s.showToast);

  const [reordering, setReordering] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<VehicleTypeRow | null>(null);
  const [formState, setFormState] = useState<VehicleTypeUpsertInput>({
    code: '',
    name_th: '',
    is_vessel: false,
    default_caretaker_position: 'พนักงานขับรถยนต์',
    icon_name: 'fa-car-side',
    is_active: true,
    is_default: false,
  });
  const [savingSingle, setSavingSingle] = useState(false);

  const [batchOpen, setBatchOpen] = useState(false);
  const [batchRows, setBatchRows] = useState<BatchRowDraft[]>([emptyBatchRow()]);
  const [savingBatch, setSavingBatch] = useState(false);

  const { data: types = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.vehicleTypesAll,
    queryFn: vehicleService.listAllVehicleTypes,
  });

  const { data: positionNames = [] } = useQuery({
    queryKey: QUERY_KEYS.portalPositions,
    queryFn: portalDirectoryService.listPositionNames,
    staleTime: 10 * 60_000,
  });

  const positionSuggestions = Array.from(
    new Set(['พนักงานขับรถยนต์', 'นายท้ายเรือ', 'ช่างเครื่องเรือ', ...positionNames])
  );

  const invalidateAll = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: QUERY_KEYS.vehicleTypes }),
      qc.invalidateQueries({ queryKey: QUERY_KEYS.vehicleTypesAll }),
      qc.invalidateQueries({ queryKey: QUERY_KEYS.vehicles }),
      qc.invalidateQueries({ queryKey: QUERY_KEYS.schemaHealth }),
      qc.invalidateQueries({ queryKey: QUERY_KEYS.auditLogs }),
    ]);
  };

  const handleMove = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= types.length || reordering) return;
    const nextOrder = [...types];
    const [moved] = nextOrder.splice(index, 1);
    nextOrder.splice(target, 0, moved);

    setReordering(true);
    try {
      await vehicleService.reorderVehicleTypes(nextOrder.map((t) => t.id));
      await invalidateAll();
      showToast('บันทึกลำดับประเภทยานพาหนะเรียบร้อยแล้ว', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'สลับลำดับไม่สำเร็จ', 'error');
    } finally {
      setReordering(false);
    }
  };

  const handleOpenCreate = () => {
    setEditingRow(null);
    setFormState({
      code: '',
      name_th: '',
      is_vessel: false,
      default_caretaker_position: 'พนักงานขับรถยนต์',
      icon_name: 'fa-car-side',
      is_active: true,
      is_default: false,
    });
    setEditModalOpen(true);
  };

  const handleOpenEdit = (row: VehicleTypeRow) => {
    setEditingRow(row);
    setFormState({
      id: row.id,
      code: row.code,
      name_th: row.name_th,
      is_vessel: row.is_vessel,
      default_caretaker_position: row.default_caretaker_position || '',
      icon_name: row.icon_name || (row.is_vessel ? 'fa-ship' : 'fa-car-side'),
      is_active: row.is_active,
      is_default: Boolean(row.is_default),
    });
    setEditModalOpen(true);
  };

  const handleSaveSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.code.trim() || !formState.name_th.trim()) {
      showToast('กรุณากรอกรหัส (Code) และชื่อประเภทยานพาหนะภาษาไทย', 'warning');
      return;
    }
    setSavingSingle(true);
    try {
      await vehicleService.saveVehicleType(formState);
      await invalidateAll();
      showToast(
        editingRow ? 'อัปเดตประเภทยานพาหนะเรียบร้อยแล้ว' : 'เพิ่มประเภทยานพาหนะใหม่เรียบร้อยแล้ว',
        'success'
      );
      setEditModalOpen(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'บันทึกประเภทยานพาหนะไม่สำเร็จ', 'error');
    } finally {
      setSavingSingle(false);
    }
  };

  const handleSaveBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    const valid = batchRows.filter((r) => r.code.trim() && r.name_th.trim());
    if (valid.length === 0) {
      showToast('กรุณากรอกอย่างน้อย 1 รายการให้ครบทั้ง Code และชื่อภาษาไทย', 'warning');
      return;
    }
    setSavingBatch(true);
    try {
      await vehicleService.saveVehicleTypesBatch(
        valid.map((r) => ({
          code: r.code,
          name_th: r.name_th,
          is_vessel: r.is_vessel,
          default_caretaker_position: r.default_caretaker_position || null,
          icon_name: r.icon_name,
        }))
      );
      await invalidateAll();
      showToast(`เพิ่มประเภทยานพาหนะใหม่ ${valid.length} รายการเรียบร้อยแล้ว`, 'success');
      setBatchOpen(false);
      setBatchRows([emptyBatchRow()]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เพิ่มหลายรายการไม่สำเร็จ', 'error');
    } finally {
      setSavingBatch(false);
    }
  };

  const handleToggleActive = async (row: VehicleTypeRow) => {
    try {
      await vehicleService.toggleVehicleTypeActive(row.id, !row.is_active);
      await invalidateAll();
      showToast(
        !row.is_active ? `เปิดใช้งาน "${row.name_th}" แล้ว` : `ปิดใช้งาน "${row.name_th}" แล้ว`,
        'success'
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เปลี่ยนสถานะไม่สำเร็จ', 'error');
    }
  };

  const handleSetDefault = async (row: VehicleTypeRow) => {
    try {
      await vehicleService.setDefaultVehicleType(row.id);
      await invalidateAll();
      showToast(`ตั้ง "${row.name_th}" เป็นประเภทยานพาหนะเริ่มต้นแล้ว`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'ตั้งค่าเริ่มต้นไม่สำเร็จ', 'error');
    }
  };

  const handleDelete = async (row: VehicleTypeRow) => {
    const confirm = await Swal.fire({
      icon: 'warning',
      title: 'ยืนยันการลบประเภทยานพาหนะ?',
      html: `<p style="font-size:14px;">ต้องการลบ <strong>${escapeHtml(row.name_th)}</strong> (<code>${escapeHtml(row.code)}</code>) หรือไม่?<br/><span style="font-size:12px;color:#64748b;">หากมียานพาหนะผูกใช้งานอยู่ ระบบจะป้องกันการลบและแนะนำให้กดปิดใช้งานแทน</span></p>`,
      showCancelButton: true,
      confirmButtonText: 'ยืนยันลบ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#dc2626',
      reverseButtons: true,
    });
    if (!confirm.isConfirmed) return;
    try {
      await vehicleService.deleteVehicleType(row.id, { code: row.code, name_th: row.name_th });
      await invalidateAll();
      showToast(`ลบประเภท "${row.name_th}" เรียบร้อยแล้ว`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'ลบประเภทยานพาหนะไม่สำเร็จ', 'error');
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white dark:bg-[#11231B] border border-slate-200/80 dark:border-[#244737] p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-extrabold text-base text-slate-800 dark:text-white">
            จัดการรายการ Dropdown &ldquo;ประเภทยานพาหนะ&rdquo;
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            เพิ่ม/แก้ไข/ลบ เปิด-ปิดใช้งาน ตั้งค่าเริ่มต้น และกด ▲/▼ จัดลำดับการแสดงผลใน Dropdown ทะเบียนรถ และรายงาน (มาตรฐานเดียวกับ Portal SSO)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setBatchRows([emptyBatchRow(), emptyBatchRow()]);
              setBatchOpen(true);
            }}
            className="bma-btn-outline text-xs"
          >
            <i className="fa-solid fa-layer-group" />
            <span>เพิ่มหลายรายการ</span>
          </button>
          <button type="button" onClick={handleOpenCreate} className="bma-btn-primary text-xs">
            <i className="fa-solid fa-plus" />
            <span>เพิ่มประเภทยานพาหนะ</span>
          </button>
        </div>
      </div>

      <section className="rounded-2xl bg-white dark:bg-[#11231B] border border-slate-200/80 dark:border-[#244737] overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-slate-400">
              <i className="fa-solid fa-spinner fa-spin mr-2" />
              กำลังโหลดประเภทยานพาหนะ...
            </div>
          ) : types.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">
              ยังไม่มีข้อมูลประเภทยานพาหนะ
            </div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 dark:bg-[#163024] text-xs font-bold text-slate-600 dark:text-emerald-200">
                <tr>
                  <th className="px-4 py-3 w-24 text-center">ลำดับ</th>
                  <th className="px-4 py-3">รหัส (Code)</th>
                  <th className="px-4 py-3">ชื่อประเภทยานพาหนะ</th>
                  <th className="px-4 py-3">หมวดหมู่</th>
                  <th className="px-4 py-3">ตำแหน่งผู้ดูแลเริ่มต้น</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3 text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#244737]">
                {types.map((row, idx) => (
                  <tr
                    key={row.id}
                    className={`hover:bg-slate-50/70 dark:hover:bg-white/5 ${
                      row.is_active ? '' : 'opacity-60'
                    }`}
                  >
                    <td className="px-4 py-3 text-center">
                      <div className="inline-flex items-center gap-1">
                        <span className="font-mono text-xs font-bold w-5 text-slate-500">
                          {idx + 1}
                        </span>
                        <button
                          type="button"
                          disabled={idx === 0 || reordering}
                          onClick={() => void handleMove(idx, -1)}
                          aria-label={`เลื่อน ${row.name_th} ขึ้น`}
                          className="btn-sort-arrow"
                        >
                          <i className="fa-solid fa-chevron-up text-[10px]" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === types.length - 1 || reordering}
                          onClick={() => void handleMove(idx, 1)}
                          aria-label={`เลื่อน ${row.name_th} ลง`}
                          className="btn-sort-arrow"
                        >
                          <i className="fa-solid fa-chevron-down text-[10px]" />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-bold text-slate-700 dark:text-slate-200">
                      {row.code}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="w-8 h-8 rounded-lg bg-emerald-500/12 text-[#00744B] dark:text-emerald-300 flex items-center justify-center shrink-0">
                          <i className={`fa-solid ${row.icon_name || 'fa-car-side'} text-xs`} />
                        </span>
                        <span className="font-bold text-slate-800 dark:text-white">
                          {row.name_th}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {row.is_vessel ? (
                        <span className="px-2.5 py-0.5 rounded-full font-bold bg-sky-500/15 text-sky-700 dark:text-sky-300">
                          เรือราชการ
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full font-bold bg-emerald-500/12 text-[#00744B] dark:text-emerald-300">
                          รถราชการ
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                      {row.default_caretaker_position || '-'}
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {row.is_default && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-400/40">
                            <i className="fa-solid fa-star mr-1" />
                            ค่าเริ่มต้น
                          </span>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            row.is_active
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                              : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {row.is_active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        {!row.is_default && row.is_active && (
                          <button
                            type="button"
                            onClick={() => void handleSetDefault(row)}
                            title="ตั้งเป็นค่าเริ่มต้น"
                            className="w-8 h-8 rounded-lg border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center text-xs transition"
                          >
                            <i className="fa-regular fa-star" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleToggleActive(row)}
                          title={row.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                          className="w-8 h-8 rounded-lg border border-slate-200 dark:border-[#244737] hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center text-xs transition"
                        >
                          <i className={`fa-solid ${row.is_active ? 'fa-toggle-on text-emerald-600' : 'fa-toggle-off'}`} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(row)}
                          title="แก้ไข"
                          className="w-8 h-8 rounded-lg border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center text-xs transition"
                        >
                          <i className="fa-solid fa-pen" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(row)}
                          title="ลบ"
                          className="w-8 h-8 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center text-xs transition"
                        >
                          <i className="fa-solid fa-trash-can" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <datalist id="vtype-caretaker-pos-options">
        {positionSuggestions.map((pos) => (
          <option key={pos} value={pos} />
        ))}
      </datalist>

      {/* Single Add/Edit Modal */}
      <ResponsiveModal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title={editingRow ? `แก้ไขประเภทยานพาหนะ (${editingRow.code})` : 'เพิ่มประเภทยานพาหนะใหม่'}
        subtitle="กำหนดรหัส ชื่อแสดงผล หมวดหมู่รถ/เรือ ไอคอน และตำแหน่งผู้ดูแลเริ่มต้น"
        icon="fa-tags"
        size="md"
        footer={
          <>
            <button type="button" onClick={() => setEditModalOpen(false)} className="bma-btn-outline">
              ยกเลิก
            </button>
            <button
              type="submit"
              form="vtype-single-form"
              disabled={savingSingle}
              className="bma-btn-primary"
            >
              <i className={`fa-solid ${savingSingle ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`} />
              <span>{savingSingle ? 'กำลังบันทึก...' : 'บันทึก'}</span>
            </button>
          </>
        }
      >
        <form id="vtype-single-form" onSubmit={handleSaveSingle} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="bma-label">รหัสประเภท (Code) *</label>
              <input
                type="text"
                value={formState.code}
                onChange={(e) =>
                  setFormState((p) => ({ ...p, code: e.target.value.toUpperCase() }))
                }
                placeholder="เช่น VAN, PICKUP, SPEEDBOAT"
                className="bma-input font-mono uppercase"
                required
              />
            </div>
            <div>
              <label className="bma-label">ชื่อประเภทยานพาหนะ (ภาษาไทย) *</label>
              <input
                type="text"
                value={formState.name_th}
                onChange={(e) => setFormState((p) => ({ ...p, name_th: e.target.value }))}
                placeholder="เช่น รถตู้, รถกระบะ, เรือตรวจการณ์"
                className="bma-input"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="bma-label">หมวดหมู่หลัก</label>
              <select
                value={formState.is_vessel ? 'vessel' : 'car'}
                onChange={(e) => {
                  const isVessel = e.target.value === 'vessel';
                  setFormState((p) => ({
                    ...p,
                    is_vessel: isVessel,
                    icon_name: isVessel ? 'fa-ship' : 'fa-car-side',
                    default_caretaker_position: isVessel ? 'นายท้ายเรือ' : 'พนักงานขับรถยนต์',
                  }));
                }}
                className="bma-input"
              >
                <option value="car">รถราชการ (ใช้หมายเลขทะเบียน + จังหวัด)</option>
                <option value="vessel">เรือราชการ (ใช้ชื่อเรือ + เลขที่ใบอนุญาตเรือ)</option>
              </select>
            </div>
            <div>
              <label className="bma-label">ตำแหน่งผู้ดูแลเริ่มต้น (Smart Caretaker)</label>
              <input
                type="text"
                list="vtype-caretaker-pos-options"
                value={formState.default_caretaker_position || ''}
                onChange={(e) =>
                  setFormState((p) => ({ ...p, default_caretaker_position: e.target.value }))
                }
                placeholder="เช่น พนักงานขับรถยนต์, นายท้ายเรือ"
                className="bma-input"
              />
            </div>
          </div>

          <div>
            <label className="bma-label">ไอคอน Font Awesome</label>
            <div className="flex flex-wrap gap-2">
              {ICON_PRESETS.map((preset) => (
                <button
                  key={preset.icon}
                  type="button"
                  onClick={() => setFormState((p) => ({ ...p, icon_name: preset.icon }))}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition flex items-center gap-1.5 ${
                    formState.icon_name === preset.icon
                      ? 'bg-[#00744B] text-white border-[#00744B]'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <i className={`fa-solid ${preset.icon}`} />
                  <span>{preset.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-5 pt-2 border-t border-slate-100 dark:border-[#244737]">
            <label className="inline-flex items-center gap-2 text-xs font-bold cursor-pointer">
              <input
                type="checkbox"
                checked={formState.is_active !== false}
                onChange={(e) => setFormState((p) => ({ ...p, is_active: e.target.checked }))}
                className="rounded border-slate-300 text-[#00744B]"
              />
              <span>เปิดใช้งานใน Dropdown</span>
            </label>
            <label className="inline-flex items-center gap-2 text-xs font-bold cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(formState.is_default)}
                onChange={(e) => setFormState((p) => ({ ...p, is_default: e.target.checked }))}
                className="rounded border-slate-300 text-amber-500"
              />
              <span>ตั้งเป็นค่าเริ่มต้นเมื่อเพิ่มยานพาหนะ</span>
            </label>
          </div>
        </form>
      </ResponsiveModal>

      {/* Batch Add Modal */}
      <ResponsiveModal
        open={batchOpen}
        onClose={() => setBatchOpen(false)}
        title="เพิ่มประเภทยานพาหนะหลายรายการพร้อมกัน"
        subtitle="กรอกรหัส ชื่อไทย หมวดหมู่ และตำแหน่งผู้ดูแลเริ่มต้นได้หลายแถวในครั้งเดียว"
        icon="fa-layer-group"
        size="lg"
        footer={
          <>
            <button type="button" onClick={() => setBatchOpen(false)} className="bma-btn-outline">
              ยกเลิก
            </button>
            <button
              type="submit"
              form="vtype-batch-form"
              disabled={savingBatch}
              className="bma-btn-primary"
            >
              <i className={`fa-solid ${savingBatch ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`} />
              <span>{savingBatch ? 'กำลังบันทึก...' : 'บันทึกทั้งหมด'}</span>
            </button>
          </>
        }
      >
        <form id="vtype-batch-form" onSubmit={handleSaveBatch} className="space-y-3">
          {batchRows.map((row, idx) => (
            <div
              key={idx}
              className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center p-3 rounded-xl bg-slate-50 dark:bg-[#163024] border border-slate-200 dark:border-[#244737]"
            >
              <input
                type="text"
                value={row.code}
                onChange={(e) =>
                  setBatchRows((prev) =>
                    prev.map((r, i) =>
                      i === idx ? { ...r, code: e.target.value.toUpperCase() } : r
                    )
                  )
                }
                placeholder="CODE เช่น VAN"
                className="bma-input sm:col-span-2 font-mono text-xs uppercase"
              />
              <input
                type="text"
                value={row.name_th}
                onChange={(e) =>
                  setBatchRows((prev) =>
                    prev.map((r, i) => (i === idx ? { ...r, name_th: e.target.value } : r))
                  )
                }
                placeholder="ชื่อภาษาไทย เช่น รถตู้"
                className="bma-input sm:col-span-3 text-xs"
              />
              <select
                value={row.is_vessel ? 'vessel' : 'car'}
                onChange={(e) => {
                  const isVessel = e.target.value === 'vessel';
                  setBatchRows((prev) =>
                    prev.map((r, i) =>
                      i === idx
                        ? {
                            ...r,
                            is_vessel: isVessel,
                            icon_name: isVessel ? 'fa-ship' : 'fa-car-side',
                            default_caretaker_position: isVessel
                              ? 'นายท้ายเรือ'
                              : 'พนักงานขับรถยนต์',
                          }
                        : r
                    )
                  );
                }}
                className="bma-input sm:col-span-3 text-xs"
              >
                <option value="car">รถราชการ</option>
                <option value="vessel">เรือราชการ</option>
              </select>
              <input
                type="text"
                list="vtype-caretaker-pos-options"
                value={row.default_caretaker_position}
                onChange={(e) =>
                  setBatchRows((prev) =>
                    prev.map((r, i) =>
                      i === idx ? { ...r, default_caretaker_position: e.target.value } : r
                    )
                  )
                }
                placeholder="ตำแหน่งผู้ดูแล"
                className="bma-input sm:col-span-3 text-xs"
              />
              <button
                type="button"
                disabled={batchRows.length <= 1}
                onClick={() => setBatchRows((prev) => prev.filter((_, i) => i !== idx))}
                aria-label="ลบแถว"
                className="sm:col-span-1 w-8 h-8 rounded-lg text-rose-500 hover:bg-rose-500/10 flex items-center justify-center mx-auto disabled:opacity-30"
              >
                <i className="fa-solid fa-trash-can text-xs" />
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={() => setBatchRows((prev) => [...prev, emptyBatchRow()])}
            className="bma-btn-outline text-xs"
          >
            <i className="fa-solid fa-plus" />
            <span>เพิ่มแถวรายการ</span>
          </button>
        </form>
      </ResponsiveModal>
    </div>
  );
}
