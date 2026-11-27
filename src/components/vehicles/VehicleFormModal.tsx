import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ResponsiveModal } from '@/components/common/ResponsiveModal';
import { ThaiDatePicker, focusInvalidThaiDateInput } from '@/components/common/ThaiDatePicker';
import { SmartCaretakerCombobox } from '@/components/common/SmartCaretakerCombobox';
import { VehicleStatusBadge } from '@/components/common/VehicleStatusBadge';
import { vehicleService } from '@/services/vehicleService';
import { portalDirectoryService } from '@/services/portalDirectoryService';
import { driveBridgeService, validateAttachmentFile } from '@/services/driveBridgeService';
import { useAppSettings } from '@/hooks/useAppSettings';
import { QUERY_KEYS } from '@/lib/queryClient';
import {
  TERMINAL_STATUS_CODES,
  VEHICLE_STATUS_MAP,
  computeVehicleStatus,
} from '@/lib/vehicleStatus';
import { formatVehicleCaretakerPositionLevel } from '@/lib/caretakerFormatter';
import { useAuthStore, isVehicleSuperAdmin } from '@/stores/useAuthStore';
import { useUiStore } from '@/stores/useUiStore';
import type {
  VehicleEnrichedRow,
  VehicleStatusCode,
  VehicleTypeRow,
} from '@/types/vehicle.types';

type BaseOperationalStatus = 'NORMAL' | 'MAINTENANCE' | 'DECOMMISSIONED' | 'DISPOSED';

const OPERATIONAL_STATUS_OPTIONS: Array<{
  code: BaseOperationalStatus;
  labelTh: string;
  hint: string;
}> = [
  {
    code: 'NORMAL',
    labelTh: 'ใช้งานปกติ (คำนวณ ปกติ / กำลังหมดอายุ / ขาดต่ออายุ อัตโนมัติ)',
    hint: 'ระบบจะคำนวณเป็น ปกติ, กำลังจะขาดต่ออายุ หรือ ขาดต่ออายุ ตามวันสิ้นอายุโดยอัตโนมัติ',
  },
  {
    code: 'MAINTENANCE',
    labelTh: 'อยู่ระหว่างซ่อมบำรุง (คำนวณควบคู่กับวันสิ้นอายุอัตโนมัติ)',
    hint: 'ระบบจะแสดงสถานะซ่อมบำรุงควบคู่กับการเตือนวันหมดอายุ และคงคิวติดตามไว้',
  },
  {
    code: 'DECOMMISSIONED',
    labelTh: 'ยุบสภาพรอจำหน่าย (หยุดแจ้งเตือนวันหมดอายุ)',
    hint: 'สถานะสิ้นสุด — หยุดนับเข้าคิวติดตามและการแจ้งเตือนวันหมดอายุ',
  },
  {
    code: 'DISPOSED',
    labelTh: 'จำหน่าย (หยุดแจ้งเตือนถาวร · บังคับกรอกวันที่จำหน่าย)',
    hint: 'สถานะสิ้นสุดถาวร — เฉพาะ SuperAdmin เท่านั้นที่สามารถคืนสถานะกลับได้',
  },
];

function toBaseOperationalStatus(code: VehicleStatusCode): BaseOperationalStatus {
  if (code === 'DISPOSED') return 'DISPOSED';
  if (code === 'DECOMMISSIONED') return 'DECOMMISSIONED';
  if (
    code === 'MAINTENANCE' ||
    code === 'MAINTENANCE_WARNING' ||
    code === 'MAINTENANCE_EXPIRED'
  ) {
    return 'MAINTENANCE';
  }
  return 'NORMAL';
}

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
  status_code: z.enum(['NORMAL', 'MAINTENANCE', 'DECOMMISSIONED', 'DISPOSED']),
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

  const { settings } = useAppSettings(open);
  const warningDays = settings.warningDaysBefore;
  const maxFileMb = settings.maxFileMb;
  const driveBridgeUrl = settings.gasDriveBridgeUrl;
  const vesselFolderId = settings.vesselLicenseFolderId;
  const canUploadVesselFile = Boolean(driveBridgeUrl && vesselFolderId);

  const { data: orgUnits = [], isLoading: loadingOrgUnits } = useQuery({
    queryKey: QUERY_KEYS.portalOrgUnits,
    queryFn: portalDirectoryService.listOrgUnits,
    enabled: open,
    staleTime: 5 * 60_000,
  });

  const defaultTypeId = useMemo(
    () =>
      vehicleTypes.find((t) => t.is_default)?.id ??
      vehicleTypes.find((t) => t.code === 'CAR')?.id ??
      vehicleTypes[0]?.id ??
      '',
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

  const watchedTypeId = watch('vehicle_type_id');
  const watchedOfficeId = watch('office_id');
  const watchedDeptId = watch('department_id');
  const watchedStatus = watch('status_code');
  const watchedExpiry = watch('current_expiry_date');

  // Scoped Org Units hierarchy (Lv2 สำนักงาน/กอง -> Lv3 ส่วน/ฝ่าย -> Lv4 กลุ่มงาน)
  const isUnassignedAdmin = Boolean(!isSuper && user?.role === 'ADMIN' && !user.admin_scope);

  const scopedDeptId = useMemo(() => {
    if (isSuper) return null;
    if (user?.role === 'ADMIN' && user.admin_scope?.scope_level_no === 3) {
      return user.admin_scope.org_unit_id;
    }
    if (user?.role !== 'ADMIN' && personnel?.department_id) {
      return personnel.department_id;
    }
    return null;
  }, [isSuper, user, personnel]);

  const scopedOfficeId = useMemo(() => {
    if (isSuper) return null;
    if (user?.role === 'ADMIN' && user.admin_scope?.scope_level_no === 2) {
      return user.admin_scope.org_unit_id;
    }
    if (user?.role === 'ADMIN' && user.admin_scope?.scope_level_no === 3) {
      if (user.admin_scope.parent_office_id) return user.admin_scope.parent_office_id;
    }
    if (scopedDeptId) {
      const deptNode = orgUnits.find((u) => u.id === scopedDeptId);
      if (deptNode?.parent_id) return deptNode.parent_id;
    }
    if (user?.role !== 'ADMIN' && personnel?.office_id) {
      return personnel.office_id;
    }
    return null;
  }, [isSuper, user, personnel, scopedDeptId, orgUnits]);

  const isOfficeLocked = Boolean(!isSuper && scopedOfficeId);
  const isDeptLocked = Boolean(!isSuper && scopedDeptId);

  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }
    if (wasOpenRef.current) return;
    wasOpenRef.current = true;

    setFormError(null);
    setVesselFile(null);
    setShowAllInOrg(false);

    if (editingVehicle) {
      setUseCaretaker(Boolean(editingVehicle.caretaker_personnel_id));
      const freshStatus = editingVehicle.computed_status_code || editingVehicle.status_code;
      reset({
        vehicle_type_id: editingVehicle.vehicle_type_id,
        license_plate: editingVehicle.license_plate || '',
        province: editingVehicle.province ?? '',
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
        status_code: toBaseOperationalStatus(freshStatus),
        remarks: editingVehicle.remarks || '',
      });
    } else {
      setUseCaretaker(false);
      const defaultOfficeId =
        scopedOfficeId ||
        (user?.admin_scope?.scope_level_no === 2
          ? user.admin_scope.org_unit_id
          : personnel?.office_id || '');

      // Only prefill personnel.department_id if it belongs to defaultOfficeId
      const personnelDeptMatchesOffice =
        !defaultOfficeId || !personnel?.office_id || personnel.office_id === defaultOfficeId;
      const defaultDeptId =
        scopedDeptId ||
        (user?.admin_scope?.scope_level_no === 3
          ? user.admin_scope.org_unit_id
          : personnelDeptMatchesOffice
            ? personnel?.department_id || ''
            : '');

      reset({
        vehicle_type_id: defaultTypeId,
        license_plate: '',
        province: settings.defaultProvince,
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
  }, [
    open,
    editingVehicle,
    defaultTypeId,
    personnel,
    user,
    scopedOfficeId,
    scopedDeptId,
    settings.defaultProvince,
    reset,
  ]);

  // Backfill defaultTypeId if vehicleTypes loads asynchronously
  useEffect(() => {
    if (open && !editingVehicle && !watchedTypeId && defaultTypeId) {
      setValue('vehicle_type_id', defaultTypeId);
    }
  }, [open, editingVehicle, watchedTypeId, defaultTypeId, setValue]);

  // Auto-sync parent office_id for Lv3 scoped admin once orgUnits loads
  useEffect(() => {
    if (open && !editingVehicle && scopedOfficeId && !watchedOfficeId) {
      setValue('office_id', scopedOfficeId);
    }
  }, [open, editingVehicle, scopedOfficeId, watchedOfficeId, setValue]);

  const selectedType = useMemo(
    () => vehicleTypes.find((t) => t.id === watchedTypeId) ?? null,
    [vehicleTypes, watchedTypeId]
  );
  const isVessel = Boolean(selectedType?.is_vessel);

  const offices = useMemo(() => {
    const lv2 = orgUnits.filter((u) => u.level_no === 2);
    if (scopedOfficeId) {
      return lv2.filter((u) => u.id === scopedOfficeId);
    }
    return lv2;
  }, [orgUnits, scopedOfficeId]);

  const departments = useMemo(() => {
    let lv3 = orgUnits.filter((u) => u.level_no === 3);
    if (watchedOfficeId) {
      lv3 = lv3.filter((u) => u.parent_id === watchedOfficeId);
    }
    if (scopedDeptId) {
      lv3 = lv3.filter((u) => u.id === scopedDeptId);
    }
    return lv3;
  }, [orgUnits, watchedOfficeId, scopedDeptId]);

  const divisions = useMemo(() => {
    if (!watchedDeptId) return [];
    return orgUnits.filter((u) => u.level_no === 4 && u.parent_id === watchedDeptId);
  }, [orgUnits, watchedDeptId]);

  // Caretaker requirement: require Lv3 (ส่วน/ฝ่าย) unless selected Lv2 office has 0 Lv3 children
  const officeHasNoDepts = Boolean(watchedOfficeId && !loadingOrgUnits && departments.length === 0);
  const canSelectCaretaker = Boolean(watchedDeptId || officeHasNoDepts);
  const caretakerQueryOfficeId = watchedDeptId ? null : officeHasNoDepts ? watchedOfficeId : null;
  const caretakerQueryDeptId = watchedDeptId || null;

  // PDPA-safe RPC caretaker candidates (no 500-row limit, works for SuperAdmin & Admin Lv2/Lv3)
  const {
    data: caretakerCandidates = [],
    isLoading: loadingPersonnel,
    error: caretakerError,
    refetch: refetchCaretakers,
  } = useQuery({
    queryKey: QUERY_KEYS.caretakerCandidates(caretakerQueryOfficeId, caretakerQueryDeptId),
    queryFn: () =>
      vehicleService.listCaretakerCandidates({
        officeId: caretakerQueryOfficeId,
        departmentId: caretakerQueryDeptId,
      }),
    enabled: open && useCaretaker && canSelectCaretaker,
    staleTime: 2 * 60_000,
  });

  const selectedOrgLabel = useMemo(() => {
    if (watchedDeptId) {
      return orgUnits.find((u) => u.id === watchedDeptId)?.name_th || editingVehicle?.department_name || 'ส่วน/ฝ่ายที่เลือก';
    }
    if (watchedOfficeId) {
      return orgUnits.find((u) => u.id === watchedOfficeId)?.name_th || editingVehicle?.office_name || 'สำนักงานที่เลือก';
    }
    return 'ส่วนราชการที่เลือก';
  }, [watchedDeptId, watchedOfficeId, orgUnits, editingVehicle]);

  const editingCaretakerFallback = useMemo(() => {
    if (!editingVehicle?.caretaker_name) return null;
    const pos = formatVehicleCaretakerPositionLevel(editingVehicle);
    return pos ? `${editingVehicle.caretaker_name}, ${pos}` : editingVehicle.caretaker_name;
  }, [editingVehicle]);

  // Terminal-state guard: only SuperAdmin may restore DISPOSED / DECOMMISSIONED
  const allowedOperationalOptions = useMemo(() => {
    if (isSuper || !editingVehicle) return OPERATIONAL_STATUS_OPTIONS;
    if (editingVehicle.status_code === 'DISPOSED') {
      return OPERATIONAL_STATUS_OPTIONS.filter((o) => o.code === 'DISPOSED');
    }
    if (editingVehicle.status_code === 'DECOMMISSIONED') {
      return OPERATIONAL_STATUS_OPTIONS.filter(
        (o) => o.code === 'DECOMMISSIONED' || o.code === 'DISPOSED'
      );
    }
    return OPERATIONAL_STATUS_OPTIONS;
  }, [isSuper, editingVehicle]);

  const isStatusTerminalLocked = Boolean(
    !isSuper && editingVehicle && TERMINAL_STATUS_CODES.has(editingVehicle.status_code)
  );

  const effectivePreviewStatus = useMemo<VehicleStatusCode>(() => {
    const isMaint = watchedStatus === 'MAINTENANCE';
    return computeVehicleStatus({
      expiryDateIso: watchedExpiry,
      isUnderMaintenance: isMaint,
      currentStatus: watchedStatus,
      warningDays,
    });
  }, [watchedExpiry, watchedStatus, warningDays]);

  const onSubmit = async (values: VehicleFormValues) => {
    setFormError(null);

    if (isUnassignedAdmin) {
      setFormError('บัญชี Admin ของท่านยังไม่ได้กำหนดขอบเขตสังกัดใน Portal SSO กรุณาติดต่อ SuperAdmin');
      return;
    }

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

    if (!isSuper && editingVehicle && TERMINAL_STATUS_CODES.has(editingVehicle.status_code)) {
      const allowedNext: BaseOperationalStatus[] =
        editingVehicle.status_code === 'DECOMMISSIONED'
          ? ['DECOMMISSIONED', 'DISPOSED']
          : ['DISPOSED'];
      if (!allowedNext.includes(values.status_code)) {
        setFormError('เฉพาะผู้ดูแลระบบสูงสุด (SuperAdmin) เท่านั้นที่สามารถคืนสถานะจากยุบสภาพหรือจำหน่ายได้');
        return;
      }
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

    // Ensure office_id is populated when a Lv3 department is chosen
    let resolvedOfficeId = values.office_id || null;
    if (!resolvedOfficeId && values.department_id) {
      const deptNode = orgUnits.find((u) => u.id === values.department_id);
      if (deptNode?.parent_id) resolvedOfficeId = deptNode.parent_id;
    }

    setSubmitting(true);
    try {
      const isMaint = values.status_code === 'MAINTENANCE';
      const computedStatus = computeVehicleStatus({
        expiryDateIso: values.current_expiry_date,
        isUnderMaintenance: isMaint,
        currentStatus: values.status_code,
        warningDays,
      });

      const basePayload = {
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
        office_id: resolvedOfficeId,
        department_id: values.department_id || null,
        division_id: values.division_id || null,
        caretaker_personnel_id: useCaretaker ? values.caretaker_personnel_id || null : null,
        status_code: computedStatus,
        is_under_maintenance: isMaint,
        attachment_folder_id: editingVehicle?.attachment_folder_id ?? null,
        latest_file_url: editingVehicle?.latest_file_url ?? null,
        remarks: values.remarks?.trim() || null,
      };

      if (editingVehicle) {
        let attachmentFolderId = editingVehicle.attachment_folder_id ?? null;
        let latestFileUrl = editingVehicle.latest_file_url ?? null;

        if (isVessel && vesselFile) {
          const uploadRes = await driveBridgeService.uploadFile({
            bridgeUrl: driveBridgeUrl,
            folderIdOrUrl: vesselFolderId,
            vehicleCode: editingVehicle.vehicle_code,
            vehicleLabel: values.vessel_name?.trim() || 'vessel',
            existingFolderId: attachmentFolderId,
            targetType: 'vessel_license',
            file: vesselFile,
            maxFileMb,
          });
          attachmentFolderId = uploadRes.folderId;
          latestFileUrl = uploadRes.url;
        }

        await vehicleService.updateVehicle(editingVehicle.id, {
          ...basePayload,
          attachment_folder_id: attachmentFolderId,
          latest_file_url: latestFileUrl,
        });
        showToast('บันทึกการแก้ไขข้อมูลยานพาหนะเรียบร้อยแล้ว', 'success');
      } else {
        // Create vehicle first to obtain real `VHxxxx` code (prevents `NEW-VESSEL` folder & orphan files)
        const created = await vehicleService.createVehicle(basePayload);

        if (isVessel && vesselFile) {
          try {
            const uploadRes = await driveBridgeService.uploadFile({
              bridgeUrl: driveBridgeUrl,
              folderIdOrUrl: vesselFolderId,
              vehicleCode: created.vehicle_code,
              vehicleLabel: values.vessel_name?.trim() || 'vessel',
              existingFolderId: null,
              targetType: 'vessel_license',
              file: vesselFile,
              maxFileMb,
            });
            await vehicleService.updateVehicleAttachment(created.id, {
              attachment_folder_id: uploadRes.folderId,
              latest_file_url: uploadRes.url,
            });
          } catch (uploadErr) {
            showToast(
              `บันทึกเรือ ${created.vehicle_code} แล้ว แต่อัปโหลดไฟล์ใบอนุญาตไม่สำเร็จ: ${
                uploadErr instanceof Error ? uploadErr.message : 'กรุณาแนบใหม่ในหน้าแก้ไข'
              }`,
              'warning'
            );
            await qc.invalidateQueries({ queryKey: QUERY_KEYS.vehicles });
            await qc.invalidateQueries({ queryKey: QUERY_KEYS.schemaHealth });
            onClose();
            return;
          }
        }

        showToast(`เพิ่มข้อมูลยานพาหนะ ${created.vehicle_code} เรียบร้อยแล้ว`, 'success');
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
            disabled={submitting || isUnassignedAdmin}
            className="bma-btn-primary"
          >
            <i className={`fa-solid ${submitting ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`} />
            <span>{submitting ? 'กำลังบันทึก...' : editingVehicle ? 'บันทึกการแก้ไข' : 'เพิ่มยานพาหนะ'}</span>
          </button>
        </>
      }
    >
      <form id="vehicle-form-root" onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {isUnassignedAdmin && (
          <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2.5">
            <i className="fa-solid fa-triangle-exclamation mt-0.5" />
            <span>
              บัญชี <strong>Admin</strong> ของท่านยังไม่ได้รับการกำหนดขอบเขตสังกัด (สำนักงาน/กอง หรือ ส่วน/ฝ่าย) ในระบบ Portal SSO-VR จึงยังไม่สามารถบันทึกข้อมูลยานพาหนะได้
            </span>
          </div>
        )}

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
            <Controller
              name="vehicle_type_id"
              control={control}
              render={({ field }) => (
                <select
                  value={field.value || ''}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    const prevType = vehicleTypes.find((t) => t.id === field.value);
                    const nextType = vehicleTypes.find((t) => t.id === nextId);
                    field.onChange(nextId);
                    if (
                      prevType &&
                      nextType &&
                      (prevType.is_vessel !== nextType.is_vessel ||
                        prevType.default_caretaker_position !== nextType.default_caretaker_position)
                    ) {
                      setValue('caretaker_personnel_id', null);
                      setShowAllInOrg(false);
                    }
                  }}
                  className="bma-input"
                >
                  {vehicleTypes.map((vt) => (
                    <option key={vt.id} value={vt.id}>
                      {vt.name_th}
                    </option>
                  ))}
                </select>
              )}
            />
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
                  ยังไม่ได้ตั้งค่าลิงก์ Google Apps Script Web App (<code>/exec</code>) และโฟลเดอร์ใบอนุญาตเรือในแท็บ{' '}
                  <strong>ตั้งค่าระบบ → Google Drive Bridge</strong> (สามารถบันทึกข้อมูลเรือได้โดยไม่ต้องแนบไฟล์)
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
                  placeholder={settings.defaultProvince}
                  className="bma-input"
                />
                <datalist id="vehicle-province-options">
                  {Array.from(
                    new Set([
                      settings.defaultProvince,
                      'กรุงเทพมหานคร',
                      'นนทบุรี',
                      'ปทุมธานี',
                      'สมุทรปราการ',
                      ...existingProvinces,
                    ])
                  )
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
              <label className="bma-label">
                สำนักงาน / กอง (Lv2)
                {isOfficeLocked && <i className="fa-solid fa-lock text-[10px] ml-1.5 text-amber-500" title="ล็อกตามขอบเขตสิทธิ์" />}
              </label>
              <Controller
                name="office_id"
                control={control}
                render={({ field }) => {
                  const val = field.value || '';
                  const missingSelected = Boolean(val && !offices.some((o) => o.id === val));
                  return (
                    <select
                      aria-label="สำนักงาน (Lv2)"
                      value={val}
                      disabled={isOfficeLocked}
                      onChange={(e) => {
                        field.onChange(e.target.value);
                        setValue('department_id', '');
                        setValue('division_id', '');
                        setValue('caretaker_personnel_id', null);
                      }}
                      className="bma-input"
                    >
                      {!isOfficeLocked && <option value="">-- เลือกสำนักงาน --</option>}
                      {missingSelected && (
                        <option value={val}>
                          {editingVehicle?.office_id === val
                            ? editingVehicle.office_name || val
                            : user?.admin_scope?.org_unit_name || val}
                        </option>
                      )}
                      {offices.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name_th}
                        </option>
                      ))}
                    </select>
                  );
                }}
              />
            </div>

            <div>
              <label className="bma-label">
                ฝ่าย / ส่วน (Lv3)
                {isDeptLocked && <i className="fa-solid fa-lock text-[10px] ml-1.5 text-amber-500" title="ล็อกตามขอบเขตสิทธิ์" />}
              </label>
              <Controller
                name="department_id"
                control={control}
                render={({ field }) => {
                  const val = field.value || '';
                  const missingSelected = Boolean(val && !departments.some((d) => d.id === val));
                  return (
                    <select
                      aria-label="ฝ่าย / ส่วน (Lv3)"
                      value={val}
                      disabled={isDeptLocked}
                      onChange={(e) => {
                        const nextDeptId = e.target.value;
                        field.onChange(nextDeptId);
                        if (nextDeptId && !watchedOfficeId) {
                          const deptNode = orgUnits.find((u) => u.id === nextDeptId);
                          if (deptNode?.parent_id) {
                            setValue('office_id', deptNode.parent_id);
                          }
                        }
                        setValue('division_id', '');
                        setValue('caretaker_personnel_id', null);
                      }}
                      className="bma-input"
                    >
                      {!isDeptLocked && <option value="">-- เลือกฝ่าย / ส่วน --</option>}
                      {missingSelected && (
                        <option value={val}>
                          {editingVehicle?.department_id === val
                            ? editingVehicle.department_name || val
                            : user?.admin_scope?.org_unit_name || val}
                        </option>
                      )}
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name_th}
                        </option>
                      ))}
                    </select>
                  );
                }}
              />
            </div>

            <div>
              <label className="bma-label">กลุ่มงาน (Lv4 - ถ้ามี)</label>
              <Controller
                name="division_id"
                control={control}
                render={({ field }) => {
                  const val = field.value || '';
                  const missingSelected = Boolean(val && !divisions.some((div) => div.id === val));
                  return (
                    <select
                      aria-label="กลุ่มงาน (Lv4 - ถ้ามี)"
                      value={val}
                      onChange={(e) => field.onChange(e.target.value)}
                      className="bma-input"
                      disabled={divisions.length === 0 && !missingSelected}
                    >
                      <option value="">-- ไม่ระบุ --</option>
                      {missingSelected && (
                        <option value={val}>
                          {editingVehicle?.division_id === val
                            ? editingVehicle.division_name || val
                            : val}
                        </option>
                      )}
                      {divisions.map((div) => (
                        <option key={div.id} value={div.id}>
                          {div.name_th}
                        </option>
                      ))}
                    </select>
                  );
                }}
              />
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-[#244737] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label
                className={`inline-flex items-center gap-2.5 select-none ${
                  canSelectCaretaker ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'
                }`}
              >
                <input
                  type="checkbox"
                  checked={useCaretaker}
                  disabled={!canSelectCaretaker}
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

              {!canSelectCaretaker && (
                <span className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold">
                  กรุณาเลือก ฝ่าย / ส่วน (Lv3) ก่อนระบุผู้ดูแล
                </span>
              )}
            </div>

            {useCaretaker && canSelectCaretaker && (
              <Controller
                name="caretaker_personnel_id"
                control={control}
                render={({ field }) => (
                  <SmartCaretakerCombobox
                    personnel={caretakerCandidates}
                    value={field.value ?? null}
                    onChange={field.onChange}
                    officeId={caretakerQueryOfficeId}
                    departmentId={caretakerQueryDeptId}
                    defaultPosition={selectedType?.default_caretaker_position}
                    showAllInOrg={showAllInOrg}
                    onToggleShowAll={setShowAllInOrg}
                    loading={loadingPersonnel}
                    errorMessage={caretakerError instanceof Error ? caretakerError.message : null}
                    onRetry={() => void refetchCaretakers()}
                    fallbackLabel={editingCaretakerFallback}
                    selectedOrgName={selectedOrgLabel}
                  />
                )}
              />
            )}
          </div>
        </div>

        {/* Section 3: Operational Status (4 Modes) + Live Computed 8-Status Preview */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="bma-label">สถานะการปฏิบัติงานของยานพาหนะ</label>
            <Controller
              name="status_code"
              control={control}
              render={({ field }) => (
                <select
                  aria-label="สถานะยานพาหนะ"
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value as BaseOperationalStatus)}
                  disabled={allowedOperationalOptions.length <= 1}
                  className="bma-input"
                >
                  {allowedOperationalOptions.map((opt) => (
                    <option key={opt.code} value={opt.code}>
                      {opt.labelTh}
                    </option>
                  ))}
                </select>
              )}
            />

            <div className="rounded-xl bg-slate-50 dark:bg-[#163024] border border-slate-200/80 dark:border-[#244737] px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-slate-600 dark:text-slate-300 font-semibold">
                สถานะจริงที่ระบบคำนวณได้ (แจ้งเตือนล่วงหน้า {warningDays} วัน):
              </span>
              <VehicleStatusBadge status={effectivePreviewStatus} />
            </div>

            {isStatusTerminalLocked && (
              <p className="text-[11px] text-rose-600 dark:text-rose-400">
                <i className="fa-solid fa-lock mr-1" />
                สถานะสิ้นสุด — การคืนสถานะกลับเป็นปกติสงวนสิทธิ์เฉพาะ SuperAdmin
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
          ) : (
            <div className="rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-900/50 p-3 text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed self-start">
              <p className="font-bold text-[#00744B] dark:text-emerald-300 mb-1">
                <i className="fa-solid fa-circle-info mr-1" />
                ความเชื่อมโยงของสถานะยานพาหนะ
              </p>
              <p>
                {OPERATIONAL_STATUS_OPTIONS.find((o) => o.code === watchedStatus)?.hint} ·{' '}
                <strong>{VEHICLE_STATUS_MAP[effectivePreviewStatus].labelTh}</strong> จะถูกนำไปใช้นับยอด KPI
                ทั้ง 9 การ์ด คิวติดตามด่วน กระดิ่งแจ้งเตือน และเงื่อนไขการต่ออายุภาษีอัตโนมัติ
              </p>
            </div>
          )}
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
