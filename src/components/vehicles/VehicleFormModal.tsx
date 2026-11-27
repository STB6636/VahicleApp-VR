import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ResponsiveModal } from '@/components/common/ResponsiveModal';
import { ThaiDatePicker, focusInvalidThaiDateInput } from '@/components/common/ThaiDatePicker';
import { SmartCaretakerCombobox } from '@/components/common/SmartCaretakerCombobox';
import { vehicleService } from '@/services/vehicleService';
import { portalDirectoryService } from '@/services/portalDirectoryService';
import { driveBridgeService, validateAttachmentFile } from '@/services/driveBridgeService';
import { QUERY_KEYS } from '@/lib/queryClient';
import { ALL_VEHICLE_STATUS_ORDER, VEHICLE_STATUS_MAP, computeVehicleStatus } from '@/lib/vehicleStatus';
import { useAuthStore, isVehicleSuperAdmin } from '@/stores/useAuthStore';
import { useUiStore } from '@/stores/useUiStore';
import type {
  VehicleEnrichedRow,
  VehicleStatusCode,
  VehicleTypeRow,
} from '@/types/vehicle.types';

const vehicleFormSchema = z.object({
  vehicle_type_id: z.string().min(1, 'กรุณาเลือกประเภทยานพาหนะ'),
  license_plate: z.string().optional(),
  province: z.string().optional(),
  vessel_name: z.string().optional(),
  vessel_license_no: z.string().optional(),
  brand: z.string().optional(),
  model: z.string().optional(),
  model_year: z.string().optional(),
  engine_cc: z.string().optional(),
  price: z.string().optional(),
  acquisition_date: z.string().optional(),
  disposal_date: z.string().optional(),
  current_expiry_date: z.string().min(1, 'กรุณาระบุวันสิ้นอายุล่าสุด'),
  office_id: z.string().optional(),
  department_id: z.string().optional(),
  division_id: z.string().optional(),
  caretaker_personnel_id: z.string().nullable().optional(),
  status_code: z.enum([
    'NORMAL',
    'WARNING',
    'EXPIRED',
    'MAINTENANCE',
    'MAINTENANCE_WARNING',
    'MAINTENANCE_EXPIRED',
    'DECOMMISSIONED',
    'DISPOSED',
  ]),
  remarks: z.string().optional(),
});

type VehicleFormValues = z.infer<typeof vehicleFormSchema>;

export interface VehicleFormModalProps {
  open: boolean;
  onClose: () => void;
  editingVehicle: VehicleEnrichedRow | null;
  vehicleTypes: VehicleTypeRow[];
  existingProvinces: string[];
}

export function VehicleFormModal({
  open,
  onClose,
  editingVehicle,
  vehicleTypes,
  existingProvinces,
}: VehicleFormModalProps) {
  const qc = useQueryClient();
  const showToast = useUiStore((s) => s.showToast);
  const user = useAuthStore((s) => s.user);
  const personnel = useAuthStore((s) => s.personnel);
  const appPermission = useAuthStore((s) => s.appPermission);
  const isSuper = isVehicleSuperAdmin(user, appPermission);

  const [useCaretaker, setUseCaretaker] = useState(false);
  const [showAllInOrg, setShowAllInOrg] = useState(false);
  const [vesselFile, setVesselFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: orgUnits = [], isLoading: loadingOrgUnits } = useQuery({
    queryKey: QUERY_KEYS.portalOrgUnits,
    queryFn: portalDirectoryService.listOrgUnits,
    enabled: open,
    staleTime: 5 * 60_000,
  });

  const { data: directoryPersonnel = [], isLoading: loadingPersonnel } = useQuery({
    queryKey: QUERY_KEYS.portalPersonnel,
    queryFn: portalDirectoryService.listPersonnel,
    enabled: open,
    staleTime: 5 * 60_000,
  });

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

  const warningDays = Number(settingsMap.warning_days_before || 45) || 45;
  const maxFileMb = Number(settingsMap.max_file_mb || 10) || 10;
  const driveBridgeUrl = (settingsMap.gas_drive_bridge_url || '').trim();
  const vesselFolderId = (settingsMap.vessel_license_folder_id || '').trim();
  const canUploadVesselFile = Boolean(driveBridgeUrl && vesselFolderId);

  const defaultTypeId = useMemo(
    () => vehicleTypes.find((t) => t.code === 'CAR')?.id ?? vehicleTypes[0]?.id ?? '',
    [vehicleTypes]
  );

  const {
    register,
    control,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors },
  } = useForm<VehicleFormValues>({
    resolver: zodResolver(vehicleFormSchema),
    defaultValues: {
      vehicle_type_id: defaultTypeId,
      status_code: 'NORMAL',
      current_expiry_date: '',
    },
  });

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    setVesselFile(null);
    setShowAllInOrg(false);

    if (editingVehicle) {
      setUseCaretaker(Boolean(editingVehicle.caretaker_personnel_id));
      reset({
        vehicle_type_id: editingVehicle.vehicle_type_id,
        license_plate: editingVehicle.license_plate || '',
        province: editingVehicle.province || 'กรุงเทพมหานคร',
        vessel_name: editingVehicle.vessel_name || '',
        vessel_license_no: editingVehicle.vessel_license_no || '',
        brand: editingVehicle.brand || '',
        model: editingVehicle.model || '',
        model_year: editingVehicle.model_year != null ? String(editingVehicle.model_year) : '',
        engine_cc: editingVehicle.engine_cc != null ? String(editingVehicle.engine_cc) : '',
        price: editingVehicle.price != null ? String(editingVehicle.price) : '',
        acquisition_date: editingVehicle.acquisition_date || '',
        disposal_date: editingVehicle.disposal_date || '',
        current_expiry_date: editingVehicle.current_expiry_date || '',
        office_id: editingVehicle.office_id || '',
        department_id: editingVehicle.department_id || '',
        division_id: editingVehicle.division_id || '',
        caretaker_personnel_id: editingVehicle.caretaker_personnel_id || null,
        status_code: editingVehicle.status_code,
        remarks: editingVehicle.remarks || '',
      });
    } else {
      setUseCaretaker(false);
      const defaultOfficeId = personnel?.office_id || '';
      const defaultDeptId = personnel?.department_id || '';
      reset({
        vehicle_type_id: defaultTypeId,
        license_plate: '',
        province: 'กรุงเทพมหานคร',
        vessel_name: '',
        vessel_license_no: '',
        brand: '',
        model: '',
        model_year: '',
        engine_cc: '',
        price: '',
        acquisition_date: '',
        disposal_date: '',
        current_expiry_date: '',
        office_id: defaultOfficeId,
        department_id: defaultDeptId,
        division_id: '',
        caretaker_personnel_id: null,
        status_code: 'NORMAL',
        remarks: '',
      });
    }
  }, [open, editingVehicle, defaultTypeId, personnel, reset]);

  const watchedTypeId = watch('vehicle_type_id');
  const watchedOfficeId = watch('office_id');
  const watchedDeptId = watch('department_id');
  const watchedStatus = watch('status_code');
  const watchedExpiry = watch('current_expiry_date');

  const selectedType = useMemo(
    () => vehicleTypes.find((t) => t.id === watchedTypeId) ?? null,
    [vehicleTypes, watchedTypeId]
  );
  const isVessel = Boolean(selectedType?.is_vessel);

  // Scoped Org Units hierarchy (Lv2 Office -> Lv3 Department -> Lv4 Division)
  const offices = useMemo(() => {
    const lv2 = orgUnits.filter((u) => u.level_no === 2);
    if (!isSuper && user?.admin_scope?.scope_level_no === 2) {
      return lv2.filter((u) => u.id === user.admin_scope?.org_unit_id);
    }
    return lv2;
  }, [orgUnits, isSuper, user]);

  const departments = useMemo(() => {
    let lv3 = orgUnits.filter((u) => u.level_no === 3);
    if (watchedOfficeId) {
      lv3 = lv3.filter((u) => u.parent_id === watchedOfficeId);
    }
    if (!isSuper && user?.admin_scope?.scope_level_no === 3) {
      lv3 = lv3.filter((u) => u.id === user.admin_scope?.org_unit_id);
    }
    return lv3;
  }, [orgUnits, watchedOfficeId, isSuper, user]);

  const divisions = useMemo(() => {
    if (!watchedDeptId) return [];
    return orgUnits.filter((u) => u.level_no === 4 && u.parent_id === watchedDeptId);
  }, [orgUnits, watchedDeptId]);

  const effectivePreviewStatus = useMemo<VehicleStatusCode>(() => {
    const isMaint =
      watchedStatus === 'MAINTENANCE' ||
      watchedStatus === 'MAINTENANCE_WARNING' ||
      watchedStatus === 'MAINTENANCE_EXPIRED';
    return computeVehicleStatus({
      expiryDateIso: watchedExpiry,
      isUnderMaintenance: isMaint,
      currentStatus: watchedStatus,
      warningDays,
    });
  }, [watchedExpiry, watchedStatus, warningDays]);

  const onSubmit = async (values: VehicleFormValues) => {
    setFormError(null);

    if (focusInvalidThaiDateInput(document.getElementById('vehicle-form-root'))) {
      setFormError('กรุณาตรวจสอบรูปแบบวันที่ พ.ศ. ให้ถูกต้อง');
      return;
    }

    if (isVessel) {
      if (!values.vessel_name?.trim()) {
        setFormError('กรุณาระบุชื่อเรือสำหรับยานพาหนะประเภทเรือ');
        return;
      }
    } else if (!values.license_plate?.trim()) {
      setFormError('กรุณาระบุหมายเลขทะเบียนรถ');
      return;
    }

    if (values.status_code === 'DISPOSED' && !values.disposal_date) {
      setFormError('กรุณาระบุวันที่จำหน่ายเมื่อเลือกสถานะ "จำหน่าย"');
      return;
    }

    if (useCaretaker && !values.caretaker_personnel_id) {
      setFormError('กรุณาเลือกผู้ดูแลจากรายชื่อ หรือปิดสวิตช์ระบุตัวบุคคลผู้ดูแล');
      return;
    }

    const parsedYear = values.model_year?.trim() ? Number(values.model_year) : null;
    if (parsedYear !== null && (!Number.isInteger(parsedYear) || parsedYear < 1950 || parsedYear > 2650)) {
      setFormError('ปีที่จดทะเบียนไม่ถูกต้อง (กรุณาระบุตัวเลขปี เช่น 2566 หรือ 2023)');
      return;
    }

    const parsedCc = values.engine_cc?.trim() ? Number(values.engine_cc) : null;
    if (parsedCc !== null && (!Number.isFinite(parsedCc) || parsedCc < 0)) {
      setFormError('ความจุกระบอกสูบ (CC) ต้องเป็นตัวเลขที่ไม่ติดลบ');
      return;
    }

    const parsedPrice = values.price?.trim() ? Number(values.price) : null;
    if (parsedPrice !== null && (!Number.isFinite(parsedPrice) || parsedPrice < 0)) {
      setFormError('ราคา (บาท) ต้องเป็นตัวเลขที่ไม่ติดลบ');
      return;
    }

    setSubmitting(true);
    try {
      let attachmentFolderId = editingVehicle?.attachment_folder_id ?? null;
      let latestFileUrl = editingVehicle?.latest_file_url ?? null;

      if (isVessel && vesselFile) {
        const uploadRes = await driveBridgeService.uploadFile({
          bridgeUrl: driveBridgeUrl,
          folderIdOrUrl: vesselFolderId,
          vehicleCode: editingVehicle?.vehicle_code || 'NEW-VESSEL',
          vehicleLabel: values.vessel_name?.trim() || 'vessel',
          existingFolderId: attachmentFolderId,
          targetType: 'vessel_license',
          file: vesselFile,
          maxFileMb,
        });
        attachmentFolderId = uploadRes.folderId;
        latestFileUrl = uploadRes.url;
      }

      const isMaint =
        values.status_code === 'MAINTENANCE' ||
        values.status_code === 'MAINTENANCE_WARNING' ||
        values.status_code === 'MAINTENANCE_EXPIRED';

      const computedStatus = computeVehicleStatus({
        expiryDateIso: values.current_expiry_date,
        isUnderMaintenance: isMaint,
        currentStatus: values.status_code,
        warningDays,
      });

      const payload = {
        vehicle_type_id: values.vehicle_type_id,
        license_plate: isVessel ? null : values.license_plate?.trim() || null,
        province: isVessel ? null : values.province?.trim() || null,
        vessel_name: isVessel ? values.vessel_name?.trim() || null : null,
        vessel_license_no: isVessel ? values.vessel_license_no?.trim() || null : null,
        brand: isVessel ? null : values.brand?.trim() || null,
        model: isVessel ? null : values.model?.trim() || null,
        model_year: isVessel ? null : parsedYear,
        engine_cc: isVessel ? null : parsedCc,
        price: isVessel ? null : parsedPrice,
        acquisition_date: values.acquisition_date || null,
        disposal_date: values.status_code === 'DISPOSED' ? values.disposal_date || null : null,
        current_expiry_date: values.current_expiry_date,
        office_id: values.office_id || null,
        department_id: values.department_id || null,
        division_id: values.division_id || null,
        caretaker_personnel_id: useCaretaker ? values.caretaker_personnel_id || null : null,
        status_code: computedStatus,
        is_under_maintenance: isMaint,
        attachment_folder_id: attachmentFolderId,
        latest_file_url: latestFileUrl,
        remarks: values.remarks?.trim() || null,
      };

      if (editingVehicle) {
        await vehicleService.updateVehicle(editingVehicle.id, payload);
        showToast('บันทึกการแก้ไขข้อมูลยานพาหนะเรียบร้อยแล้ว', 'success');
      } else {
        await vehicleService.createVehicle(payload);
        showToast('เพิ่มข้อมูลยานพาหนะใหม่เรียบร้อยแล้ว', 'success');
      }

      await qc.invalidateQueries({ queryKey: QUERY_KEYS.vehicles });
      await qc.invalidateQueries({ queryKey: QUERY_KEYS.schemaHealth });
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'ไม่สามารถบันทึกข้อมูลยานพาหนะได้');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      title={editingVehicle ? `แก้ไขยานพาหนะ (${editingVehicle.vehicle_code})` : 'เพิ่มยานพาหนะราชการใหม่'}
      subtitle={isVessel ? 'โหมดข้อมูลเรือราชการและใบอนุญาตใช้เรือ' : 'โหมดข้อมูลรถราชการและข้อมูลทางเทคนิค'}
      icon={isVessel ? 'fa-ship' : 'fa-car-side'}
      size="xl"
      preventBackdropClose={submitting}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={submitting} className="bma-btn-outline">
            ยกเลิก
          </button>
          <button
            type="submit"
            form="vehicle-form-root"
            disabled={submitting}
            className="bma-btn-primary"
          >
            <i className={`fa-solid ${submitting ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`} />
            <span>{submitting ? 'กำลังบันทึก...' : editingVehicle ? 'บันทึกการแก้ไข' : 'เพิ่มยานพาหนะ'}</span>
          </button>
        </>
      }
    >
      <form id="vehicle-form-root" onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {formError && (
          <div className="rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 text-xs text-rose-700 dark:text-rose-200 flex items-start gap-2.5">
            <i className="fa-solid fa-circle-exclamation mt-0.5" />
            <span>{formError}</span>
          </div>
        )}

        {/* Section 1: Identity & Type */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="bma-label">ประเภทยานพาหนะ *</label>
            <select {...register('vehicle_type_id')} className="bma-input">
              {vehicleTypes.map((vt) => (
                <option key={vt.id} value={vt.id}>
                  {vt.name_th}
                </option>
              ))}
            </select>
            {errors.vehicle_type_id && (
              <p className="text-[11px] text-rose-600 mt-1">{errors.vehicle_type_id.message}</p>
            )}
          </div>

          <div>
            <label className="bma-label">วันสิ้นอายุภาษี / ใบอนุญาตล่าสุด (พ.ศ.) *</label>
            <Controller
              name="current_expiry_date"
              control={control}
              render={({ field }) => (
                <ThaiDatePicker
                  value={field.value || ''}
                  onChange={field.onChange}
                  showThaiPreview
                  placeholder="วว/ดด/พ.ศ. เช่น 30/09/2569"
                />
              )}
            />
            {errors.current_expiry_date && (
              <p className="text-[11px] text-rose-600 mt-1">{errors.current_expiry_date.message}</p>
            )}
          </div>
        </div>

        {/* Dynamic Car vs Vessel Fields */}
        {isVessel ? (
          <div className="rounded-2xl border border-sky-200 dark:border-sky-900/60 bg-sky-50/50 dark:bg-sky-950/20 p-4 space-y-4">
            <p className="text-xs font-extrabold text-sky-700 dark:text-sky-300 flex items-center gap-2">
              <i className="fa-solid fa-ship" />
              ข้อมูลเฉพาะเรือราชการ
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="bma-label">ชื่อเรือ *</label>
                <input
                  {...register('vessel_name')}
                  placeholder="เช่น เรือตรวจการณ์เทศกิจ 1"
                  className="bma-input"
                />
              </div>
              <div>
                <label className="bma-label">เลขที่ใบอนุญาตใช้เรือ</label>
                <input
                  {...register('vessel_license_no')}
                  placeholder="เช่น กท.1234/2569"
                  className="bma-input"
                />
              </div>
            </div>

            <div>
              <label className="bma-label">แนบไฟล์ใบอนุญาตใช้เรือ (PDF / JPG / PNG สูงสุด {maxFileMb} MB)</label>
              {canUploadVesselFile ? (
                <div className="space-y-1.5">
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
                          setVesselFile(null);
                          return;
                        }
                      }
                      setVesselFile(f);
                    }}
                    className="bma-input text-xs file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:bg-emerald-600 file:text-white file:text-xs file:font-bold"
                  />
                  {editingVehicle?.latest_file_url && !vesselFile && (
                    <a
                      href={editingVehicle.latest_file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-700 dark:text-sky-400 hover:underline"
                    >
                      <i className="fa-solid fa-paperclip" />
                      ดูไฟล์ใบอนุญาตเดิมที่แนบไว้
                    </a>
                  )}
                </div>
              ) : (
                <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                  <i className="fa-solid fa-circle-info mr-1.5" />
                  ยังไม่ได้ตั้งค่า <code>gas_drive_bridge_url</code> และ <code>vessel_license_folder_id</code> ในหน้าตั้งค่าระบบ (สามารถบันทึกข้อมูลเรือได้โดยไม่ต้องแนบไฟล์)
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-emerald-200/80 dark:border-[#244737] bg-slate-50/70 dark:bg-[#163024]/60 p-4 space-y-4">
            <p className="text-xs font-extrabold text-[#00744B] dark:text-emerald-300 flex items-center gap-2">
              <i className="fa-solid fa-car-side" />
              ข้อมูลทะเบียนและรายละเอียดทางเทคนิค (รถราชการ)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              <div>
                <label className="bma-label">หมายเลขทะเบียนรถ *</label>
                <input
                  {...register('license_plate')}
                  placeholder="เช่น 1กข 1234"
                  className="bma-input"
                />
              </div>
              <div>
                <label className="bma-label">จังหวัด</label>
                <input
                  {...register('province')}
                  list="vehicle-province-options"
                  placeholder="กรุงเทพมหานคร"
                  className="bma-input"
                />
                <datalist id="vehicle-province-options">
                  {Array.from(new Set(['กรุงเทพมหานคร', 'นนทบุรี', 'ปทุมธานี', 'สมุทรปราการ', ...existingProvinces]))
                    .sort()
                    .map((prov) => (
                      <option key={prov} value={prov} />
                    ))}
                </datalist>
              </div>
              <div>
                <label className="bma-label">ยี่ห้อ (Brand)</label>
                <input {...register('brand')} placeholder="เช่น Toyota, Isuzu, Honda" className="bma-input" />
              </div>
              <div>
                <label className="bma-label">รุ่น (Model)</label>
                <input {...register('model')} placeholder="เช่น Hilux Revo, Wave 125i" className="bma-input" />
              </div>
              <div>
                <label className="bma-label">ปีที่จดทะเบียน (พ.ศ. / ค.ศ.)</label>
                <input {...register('model_year')} type="number" placeholder="เช่น 2566" className="bma-input" />
              </div>
              <div>
                <label className="bma-label">ความจุกระบอกสูบ (CC)</label>
                <input {...register('engine_cc')} type="number" placeholder="เช่น 2400" className="bma-input" />
              </div>
              <div>
                <label className="bma-label">ราคา (บาท)</label>
                <input {...register('price')} type="number" step="0.01" placeholder="เช่น 850000" className="bma-input" />
              </div>
              <div className="sm:col-span-2">
                <label className="bma-label">วันที่ได้มา (พ.ศ.)</label>
                <Controller
                  name="acquisition_date"
                  control={control}
                  render={({ field }) => (
                    <ThaiDatePicker value={field.value || ''} onChange={field.onChange} />
                  )}
                />
              </div>
            </div>
          </div>
        )}

        {/* Section 2: Organization Hierarchy & Smart Caretaker */}
        <div className="rounded-2xl border border-slate-200 dark:border-[#244737] p-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-extrabold text-slate-700 dark:text-slate-200 flex items-center gap-2">
              <i className="fa-solid fa-sitemap text-[#00744B] dark:text-emerald-400" />
              สังกัดหน่วยงาน และผู้ดูแลยานพาหนะ (Portal SSO Directory)
            </p>
            {loadingOrgUnits && <span className="text-[11px] text-slate-400">กำลังโหลดโครงสร้างหน่วยงาน...</span>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div>
              <label className="bma-label">สำนักงาน (Lv2)</label>
              <select
                {...register('office_id')}
                onChange={(e) => {
                  setValue('office_id', e.target.value);
                  setValue('department_id', '');
                  setValue('division_id', '');
                  setValue('caretaker_personnel_id', null);
                }}
                className="bma-input"
              >
                <option value="">-- เลือกสำนักงาน --</option>
                {offices.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name_th}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="bma-label">ฝ่าย / ส่วน (Lv3)</label>
              <select
                {...register('department_id')}
                onChange={(e) => {
                  setValue('department_id', e.target.value);
                  setValue('division_id', '');
                  setValue('caretaker_personnel_id', null);
                }}
                className="bma-input"
              >
                <option value="">-- เลือกฝ่าย / ส่วน --</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name_th}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="bma-label">กลุ่มงาน (Lv4 - ถ้ามี)</label>
              <select {...register('division_id')} className="bma-input" disabled={divisions.length === 0}>
                <option value="">-- ไม่ระบุ --</option>
                {divisions.map((div) => (
                  <option key={div.id} value={div.id}>
                    {div.name_th}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-[#244737] space-y-3">
            <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={useCaretaker}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setUseCaretaker(checked);
                  if (!checked) {
                    setValue('caretaker_personnel_id', null);
                    setShowAllInOrg(false);
                  }
                }}
                className="rounded border-slate-300 text-[#00744B] focus:ring-emerald-500 w-4 h-4"
              />
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                ระบุตัวบุคคลผู้ดูแลยานพาหนะ (Smart Caretaker Filter)
              </span>
            </label>

            {useCaretaker && (
              <Controller
                name="caretaker_personnel_id"
                control={control}
                render={({ field }) => (
                  <SmartCaretakerCombobox
                    personnel={directoryPersonnel}
                    value={field.value ?? null}
                    onChange={field.onChange}
                    officeId={watchedOfficeId}
                    departmentId={watchedDeptId}
                    defaultPosition={selectedType?.default_caretaker_position}
                    showAllInOrg={showAllInOrg}
                    onToggleShowAll={setShowAllInOrg}
                    loading={loadingPersonnel}
                    fallbackLabel={editingVehicle?.caretaker_name}
                  />
                )}
              />
            )}
          </div>
        </div>

        {/* Section 3: Status, Disposal Date & Remarks */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="bma-label">สถานะยานพาหนะ</label>
            <select {...register('status_code')} className="bma-input">
              {ALL_VEHICLE_STATUS_ORDER.map((code) => (
                <option key={code} value={code}>
                  {VEHICLE_STATUS_MAP[code].labelTh}
                </option>
              ))}
            </select>
            {effectivePreviewStatus !== watchedStatus && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                <i className="fa-solid fa-wand-magic-sparkles mr-1" />
                ระบบจะคำนวณสถานะจริงตามวันสิ้นอายุเป็น &ldquo;{VEHICLE_STATUS_MAP[effectivePreviewStatus].labelTh}&rdquo;
              </p>
            )}
          </div>

          {watchedStatus === 'DISPOSED' ? (
            <div>
              <label className="bma-label text-rose-600 dark:text-rose-400">วันที่จำหน่าย (พ.ศ.) *</label>
              <Controller
                name="disposal_date"
                control={control}
                render={({ field }) => (
                  <ThaiDatePicker value={field.value || ''} onChange={field.onChange} showThaiPreview />
                )}
              />
            </div>
          ) : isVessel ? (
            <div>
              <label className="bma-label">วันที่ได้มา (พ.ศ.)</label>
              <Controller
                name="acquisition_date"
                control={control}
                render={({ field }) => (
                  <ThaiDatePicker value={field.value || ''} onChange={field.onChange} />
                )}
              />
            </div>
          ) : null}
        </div>

        <div>
          <label className="bma-label">หมายเหตุเพิ่มเติม</label>
          <textarea
            {...register('remarks')}
            rows={2}
            placeholder="บันทึกข้อมูลเพิ่มเติม เช่น หมายเลขเครื่องยนต์ หมายเลขตัวถัง หรือรายละเอียดการใช้งาน..."
            className="bma-input"
          />
        </div>
      </form>
    </ResponsiveModal>
  );
}
