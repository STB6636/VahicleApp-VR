import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ResponsiveModal } from '@/components/common/ResponsiveModal';
import { ThaiDatePicker, focusInvalidThaiDateInput } from '@/components/common/ThaiDatePicker';
import { VehicleStatusBadge } from '@/components/common/VehicleStatusBadge';
import { VehiclePickerModal } from '@/components/activities/VehiclePickerModal';
import { vehicleService } from '@/services/vehicleService';
import { driveBridgeService, validateAttachmentFile } from '@/services/driveBridgeService';
import { QUERY_KEYS } from '@/lib/queryClient';
import {
  ACTIVITY_TYPE_LIST,
  ACTIVITY_TYPE_MAP,
  getEligibleVehiclesForActivity,
} from '@/lib/vehicleStatus';
import { getTodayIsoBangkok } from '@/lib/thaiDate';
import { useAuthStore, isVehicleSuperAdmin } from '@/stores/useAuthStore';
import { useUiStore } from '@/stores/useUiStore';
import type { ActivityTypeCode, VehicleEnrichedRow, VehicleTypeRow } from '@/types/vehicle.types';

export interface ActivityRecordModalProps {
  open: boolean;
  onClose: () => void;
  vehicles: VehicleEnrichedRow[];
  vehicleTypes: VehicleTypeRow[];
  preselectedVehicleId?: string | null;
}

export function ActivityRecordModal({
  open,
  onClose,
  vehicles,
  vehicleTypes,
  preselectedVehicleId,
}: ActivityRecordModalProps) {
  const qc = useQueryClient();
  const showToast = useUiStore((s) => s.showToast);
  const user = useAuthStore((s) => s.user);
  const appPermission = useAuthStore((s) => s.appPermission);
  const isSuper = isVehicleSuperAdmin(user, appPermission);

  const [activityType, setActivityType] = useState<ActivityTypeCode>('TAX_RENEWAL');
  const [isMultiMode, setIsMultiMode] = useState(false);
  const [includeNormalForTax, setIncludeNormalForTax] = useState(false);
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [documentNo, setDocumentNo] = useState('');
  const [startDate, setStartDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [location, setLocation] = useState('');
  const [details, setDetails] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: settings = [] } = useQuery({
    queryKey: QUERY_KEYS.settings,
    queryFn: vehicleService.listSettings,
    enabled: open,
  });

  const settingsMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of settings) map[s.key] = s.value;
    return map;
  }, [settings]);

  const maxFileMb = Number(settingsMap.max_file_mb || 10) || 10;
  const driveBridgeUrl = (settingsMap.gas_drive_bridge_url || '').trim();
  const activityFolderId = (settingsMap.activity_folder_id || '').trim();
  const canUploadFile = Boolean(driveBridgeUrl && activityFolderId);

  const availableActivityTypes = useMemo(
    () => ACTIVITY_TYPE_LIST.filter((item) => !item.superAdminOnly || isSuper),
    [isSuper]
  );

  // Reset form state when modal opens
  useEffect(() => {
    if (!open) return;
    setFormError(null);
    setDocumentNo('');
    setStartDate(getTodayIsoBangkok());
    setExpiryDate('');
    setLocation('');
    setDetails('');
    setFile(null);
    setIsMultiMode(false);

    if (preselectedVehicleId) {
      const target = vehicles.find((v) => v.id === preselectedVehicleId);
      if (target) {
        const st = target.computed_status_code || target.status_code;
        if (st === 'DECOMMISSIONED' || st === 'DISPOSED') {
          setActivityType(isSuper ? 'RESTORE_NORMAL' : 'DISPOSE');
        } else if (st === 'MAINTENANCE') {
          setActivityType('MAINTENANCE_COMPLETE');
        } else {
          setActivityType('TAX_RENEWAL');
          setIncludeNormalForTax(st === 'NORMAL');
        }
        setSelectedVehicleIds([preselectedVehicleId]);
        return;
      }
    }

    setActivityType('TAX_RENEWAL');
    setIncludeNormalForTax(false);
    setSelectedVehicleIds([]);
  }, [open, preselectedVehicleId, vehicles, isSuper]);

  const eligibleVehicles = useMemo(
    () =>
      getEligibleVehiclesForActivity(vehicles, activityType, {
        includeNormalForTaxRenewal: includeNormalForTax,
      }),
    [vehicles, activityType, includeNormalForTax]
  );

  const selectedVehicles = useMemo(
    () =>
      selectedVehicleIds
        .map((id) => vehicles.find((v) => v.id === id))
        .filter((v): v is VehicleEnrichedRow => Boolean(v)),
    [selectedVehicleIds, vehicles]
  );

  const hasVesselSelected = useMemo(
    () => selectedVehicles.some((v) => v.is_vessel),
    [selectedVehicles]
  );

  const handleChangeActivityType = (nextType: ActivityTypeCode) => {
    setActivityType(nextType);
    setFormError(null);
    // Prune any previously selected vehicles that aren't eligible for the new activity type
    const nextEligible = new Set(
      getEligibleVehiclesForActivity(vehicles, nextType, {
        includeNormalForTaxRenewal: includeNormalForTax,
      }).map((v) => v.id)
    );
    setSelectedVehicleIds((prev) => prev.filter((id) => nextEligible.has(id)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (focusInvalidThaiDateInput(document.getElementById('activity-record-form'))) {
      setFormError('กรุณาตรวจสอบรูปแบบวันที่ พ.ศ. ให้ถูกต้อง');
      return;
    }

    if (selectedVehicleIds.length === 0) {
      setFormError('กรุณาเลือกยานพาหนะอย่างน้อย 1 รายการ');
      return;
    }

    if (activityType === 'TAX_RENEWAL') {
      if (!expiryDate) {
        setFormError('กรุณาระบุวันสิ้นอายุใหม่สำหรับการต่ออายุภาษี / ใบอนุญาต');
        return;
      }
      if (hasVesselSelected && !documentNo.trim()) {
        setFormError('กรุณาระบุเลขที่ใบอนุญาตเรือ (บังคับสำหรับรายการที่มีเรือ)');
        return;
      }
      if (hasVesselSelected && canUploadFile && !file) {
        setFormError('กรุณาแนบไฟล์หลักฐานใบอนุญาตเรือ (PDF / JPG / PNG)');
        return;
      }
    }

    setSubmitting(true);
    try {
      let fileUrl: string | null = null;
      let fileName: string | null = null;

      if (file) {
        const leadVehicle = selectedVehicles[0];
        const uploadRes = await driveBridgeService.uploadFile({
          bridgeUrl: driveBridgeUrl,
          folderIdOrUrl: activityFolderId,
          vehicleCode:
            selectedVehicles.length > 1
              ? `BATCH-${leadVehicle?.vehicle_code || 'MULTI'}`
              : leadVehicle?.vehicle_code || 'VEHICLE',
          vehicleLabel:
            selectedVehicles.length > 1
              ? `${selectedVehicles.length}-vehicles`
              : leadVehicle?.vehicle_label || 'activity',
          existingFolderId: selectedVehicles.length === 1 ? leadVehicle?.attachment_folder_id : null,
          targetType: 'activity',
          file,
          maxFileMb,
        });
        fileUrl = uploadRes.url;
        fileName = uploadRes.fileName;
      }

      const result = await vehicleService.recordActivity({
        vehicle_ids: selectedVehicleIds,
        activity_type: activityType,
        document_no: documentNo.trim() || null,
        start_date: startDate || null,
        expiry_date: activityType === 'TAX_RENEWAL' ? expiryDate || null : null,
        location: activityType === 'MAINTENANCE_SEND' ? location.trim() || null : null,
        details: details.trim() || null,
        file_url: fileUrl,
        file_name: fileName,
      });

      showToast(result.message || `บันทึกรายการสำเร็จ ${result.updated_count} รายการ`, 'success');
      await Promise.all([
        qc.invalidateQueries({ queryKey: QUERY_KEYS.vehicles }),
        qc.invalidateQueries({ queryKey: QUERY_KEYS.activities() }),
        qc.invalidateQueries({ queryKey: QUERY_KEYS.schemaHealth }),
      ]);
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'ไม่สามารถบันทึกรายการได้');
    } finally {
      setSubmitting(false);
    }
  };

  const activeMeta = ACTIVITY_TYPE_MAP[activityType];

  return (
    <>
      <ResponsiveModal
        open={open}
        onClose={onClose}
        title="บันทึกต่ออายุภาษี / ซ่อมบำรุง / เปลี่ยนสถานะ"
        subtitle="ทำงานแบบ Atomic Transaction ผ่าน RPC vehicleapp.fn_record_vehicle_activity"
        icon="fa-clipboard-check"
        size="xl"
        preventBackdropClose={submitting}
        footer={
          <>
            <button type="button" onClick={onClose} disabled={submitting} className="bma-btn-outline">
              ยกเลิก
            </button>
            <button
              type="submit"
              form="activity-record-form"
              disabled={submitting || selectedVehicleIds.length === 0}
              className="bma-btn-primary"
            >
              <i className={`fa-solid ${submitting ? 'fa-spinner fa-spin' : 'fa-check-double'}`} />
              <span>
                {submitting
                  ? 'กำลังบันทึก...'
                  : `บันทึกรายการ${selectedVehicleIds.length > 0 ? ` (${selectedVehicleIds.length} คัน)` : ''}`}
              </span>
            </button>
          </>
        }
      >
        <form id="activity-record-form" onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 text-xs text-rose-700 dark:text-rose-200 flex items-start gap-2.5">
              <i className="fa-solid fa-circle-exclamation mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {/* 1. Activity Type Selection */}
          <div>
            <label className="bma-label">ประเภทรายการ *</label>
            <select
              value={activityType}
              onChange={(e) => handleChangeActivityType(e.target.value as ActivityTypeCode)}
              className="bma-input font-bold"
            >
              {availableActivityTypes.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.labelTh}
                </option>
              ))}
            </select>
          </div>

          {/* 2. Mode Toggle (Single vs Multi-Vehicle Batch) */}
          <div className="rounded-2xl border border-slate-200 dark:border-[#244737] bg-slate-50/70 dark:bg-[#163024]/60 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="bma-label mb-0">
                ยานพาหนะที่ต้องการดำเนินการ * ({eligibleVehicles.length} คันที่มีสิทธิ์)
              </label>

              <div className="flex flex-wrap items-center gap-3">
                {activityType === 'TAX_RENEWAL' && (
                  <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeNormalForTax}
                      onChange={(e) => setIncludeNormalForTax(e.target.checked)}
                      className="rounded border-slate-300 text-[#00744B] focus:ring-emerald-500"
                    />
                    <span>รวมสถานะปกติ (ต่อล่วงหน้า)</span>
                  </label>
                )}

                <label className="inline-flex items-center gap-2 text-xs font-bold text-[#00744B] dark:text-emerald-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isMultiMode}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setIsMultiMode(next);
                      if (!next && selectedVehicleIds.length > 1) {
                        setSelectedVehicleIds(selectedVehicleIds.slice(0, 1));
                      }
                    }}
                    className="rounded border-slate-300 text-[#00744B] focus:ring-emerald-500"
                  />
                  <span>บันทึกหลายคันพร้อมกัน (Batch)</span>
                </label>
              </div>
            </div>

            {!isMultiMode ? (
              <div className="flex gap-2">
                <select
                  value={selectedVehicleIds[0] || ''}
                  onChange={(e) => setSelectedVehicleIds(e.target.value ? [e.target.value] : [])}
                  className="bma-input flex-1"
                >
                  <option value="">-- กรุณาเลือกยานพาหนะ --</option>
                  {eligibleVehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      [{v.vehicle_type_name}] {v.vehicle_label} ({v.department_name || v.office_name || '-'})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="bma-btn-outline shrink-0"
                >
                  <i className="fa-solid fa-magnifying-glass" />
                  <span>ค้นหา</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    เลือกแล้ว <strong className="text-[#00744B] dark:text-emerald-300">{selectedVehicles.length}</strong> รายการ
                  </span>
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    className="bma-btn-outline py-1.5 px-3 text-xs"
                  >
                    <i className="fa-solid fa-plus" />
                    <span>เลือก / แก้ไขรายการยานพาหนะ</span>
                  </button>
                </div>

                {selectedVehicles.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 dark:border-[#244737] py-5 text-center text-xs text-slate-400">
                    ยังไม่ได้เลือกยานพาหนะ — กดปุ่ม &ldquo;เลือก / แก้ไขรายการยานพาหนะ&rdquo; ด้านบน
                  </div>
                ) : (
                  <ul className="max-h-40 overflow-y-auto divide-y divide-slate-100 dark:divide-[#244737] rounded-xl bg-white dark:bg-[#11231B] border border-slate-200 dark:border-[#244737]">
                    {selectedVehicles.map((v) => (
                      <li key={v.id} className="px-3 py-2 flex items-center justify-between gap-2 text-xs">
                        <div className="min-w-0 flex items-center gap-2">
                          <span className="font-bold text-slate-800 dark:text-white truncate">
                            [{v.vehicle_type_name}] {v.vehicle_label}
                          </span>
                          <VehicleStatusBadge status={v.computed_status_code || v.status_code} />
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedVehicleIds((prev) => prev.filter((id) => id !== v.id))
                          }
                          aria-label="นำออก"
                          className="w-6 h-6 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-center shrink-0"
                        >
                          <i className="fa-solid fa-xmark" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* 3. Dynamic Fields by Activity Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className={activityType === 'TAX_RENEWAL' ? 'sm:col-span-2' : ''}>
              <label className="bma-label">
                {activityType === 'TAX_RENEWAL' && hasVesselSelected
                  ? 'เลขที่ใบอนุญาตเรือ (บังคับสำหรับเรือ) *'
                  : 'เลขที่เอกสาร / ใบเสร็จ / หนังสืออ้างอิง'}
              </label>
              <input
                type="text"
                value={documentNo}
                onChange={(e) => setDocumentNo(e.target.value)}
                placeholder={
                  activityType === 'TAX_RENEWAL'
                    ? hasVesselSelected
                      ? 'ระบุเลขที่ใบอนุญาตใช้เรือ...'
                      : 'เช่น ใบเสร็จรับเงิน / เล่มทะเบียน (ถ้าว่างระบบใส่ "ต่อภาษีประจำปี")'
                    : 'เลขที่หนังสือ / ใบส่งซ่อม / เลขที่เอกสารอ้างอิง'
                }
                className="bma-input"
              />
            </div>

            <div>
              <label className="bma-label">
                {activityType === 'TAX_RENEWAL'
                  ? 'วันที่อนุญาต / วันที่ต่ออายุ (พ.ศ.)'
                  : activityType === 'DISPOSE'
                    ? 'วันที่จำหน่าย (พ.ศ.)'
                    : 'วันที่ดำเนินการ (พ.ศ.)'}
              </label>
              <ThaiDatePicker value={startDate} onChange={setStartDate} showThaiPreview />
            </div>

            {activityType === 'TAX_RENEWAL' && (
              <div>
                <label className="bma-label">วันสิ้นอายุใหม่ (พ.ศ.) *</label>
                <ThaiDatePicker
                  value={expiryDate}
                  onChange={setExpiryDate}
                  showThaiPreview
                  placeholder="ระบุวันสิ้นอายุใหม่ เช่น 30/09/2570"
                />
              </div>
            )}

            {activityType === 'MAINTENANCE_SEND' && (
              <div className="sm:col-span-2">
                <label className="bma-label">สถานที่ส่งซ่อม / อู่ซ่อม / ศูนย์บริการ</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="ระบุชื่ออู่ซ่อม ศูนย์บริการ หรือกองโรงงานช่างกล..."
                  className="bma-input"
                />
              </div>
            )}
          </div>

          <div>
            <label className="bma-label">รายละเอียดเพิ่มเติม</label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={2}
              placeholder="บันทึกรายละเอียดอาการเสีย ผลการซ่อม เหตุผลการยุบสภาพ/จำหน่าย หรือหมายเหตุ..."
              className="bma-input"
            />
          </div>

          {/* 4. Evidence File Upload (GAS Google Drive Bridge) */}
          <div>
            <label className="bma-label">
              ไฟล์หลักฐาน PDF / JPG / PNG (สูงสุด {maxFileMb} MB){' '}
              {activityType === 'TAX_RENEWAL' && hasVesselSelected && canUploadFile
                ? '* (บังคับสำหรับเรือ)'
                : '(ทางเลือก)'}
            </label>
            {canUploadFile ? (
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  if (f) {
                    const check = validateAttachmentFile(f, maxFileMb);
                    if (!check.valid) {
                      setFormError(check.error || 'ไฟล์ไม่ถูกต้อง');
                      e.target.value = '';
                      setFile(null);
                      return;
                    }
                  }
                  setFile(f);
                }}
                className="bma-input text-xs file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:bg-emerald-600 file:text-white file:text-xs file:font-bold"
              />
            ) : (
              <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                <i className="fa-solid fa-circle-info mr-1.5" />
                ยังไม่ได้ตั้งค่า <code>gas_drive_bridge_url</code> และ <code>activity_folder_id</code> ในหน้าตั้งค่า (สามารถบันทึกรายการได้โดยยังไม่แนบไฟล์)
              </div>
            )}
          </div>

          {/* 5. Contextual State Transition Hint */}
          <div className="rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 px-4 py-3 text-xs text-emerald-900 dark:text-emerald-200 flex items-start gap-2.5">
            <i className={`fa-solid ${activeMeta.icon} mt-0.5 text-[#00744B] dark:text-emerald-400`} />
            <div>
              <p className="font-extrabold">{activeMeta.labelTh}</p>
              <p className="mt-0.5 opacity-90">{activeMeta.hint}</p>
            </div>
          </div>
        </form>
      </ResponsiveModal>

      <VehiclePickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        mode={isMultiMode ? 'multi' : 'single'}
        vehicles={eligibleVehicles}
        vehicleTypes={vehicleTypes}
        selectedIds={selectedVehicleIds}
        onConfirm={(ids) => setSelectedVehicleIds(ids)}
      />
    </>
  );
}
