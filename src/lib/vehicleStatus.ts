import type { ActivityTypeCode, VehicleEnrichedRow, VehicleStatusCode } from '@/types/vehicle.types';
import { getTodayIsoBangkok } from '@/lib/thaiDate';

export interface VehicleStatusMeta {
  code: VehicleStatusCode;
  labelTh: string;
  shortLabelTh: string;
  priority: number;
  isTerminal: boolean;
  isMaintenance: boolean;
  needsTracking: boolean;
  tone: 'success' | 'warning' | 'danger' | 'info' | 'muted';
  icon: string;
}

export const VEHICLE_STATUS_MAP: Record<VehicleStatusCode, VehicleStatusMeta> = {
  EXPIRED: {
    code: 'EXPIRED',
    labelTh: 'ขาดต่ออายุ',
    shortLabelTh: 'สิ้นอายุแล้ว',
    priority: 1,
    isTerminal: false,
    isMaintenance: false,
    needsTracking: true,
    tone: 'danger',
    icon: 'fa-circle-exclamation',
  },
  MAINTENANCE_EXPIRED: {
    code: 'MAINTENANCE_EXPIRED',
    labelTh: 'ซ่อมบำรุง ขาดต่ออายุ',
    shortLabelTh: 'ซ่อมฯ/สิ้นอายุแล้ว',
    priority: 2,
    isTerminal: false,
    isMaintenance: true,
    needsTracking: true,
    tone: 'danger',
    icon: 'fa-wrench',
  },
  WARNING: {
    code: 'WARNING',
    labelTh: 'กำลังจะขาดต่ออายุ',
    shortLabelTh: 'กำลังจะหมดอายุ',
    priority: 3,
    isTerminal: false,
    isMaintenance: false,
    needsTracking: true,
    tone: 'warning',
    icon: 'fa-clock',
  },
  MAINTENANCE_WARNING: {
    code: 'MAINTENANCE_WARNING',
    labelTh: 'ซ่อมบำรุง กำลังจะขาดต่ออายุ',
    shortLabelTh: 'ซ่อมฯ/กำลังหมดอายุ',
    priority: 4,
    isTerminal: false,
    isMaintenance: true,
    needsTracking: true,
    tone: 'warning',
    icon: 'fa-screwdriver-wrench',
  },
  MAINTENANCE: {
    code: 'MAINTENANCE',
    labelTh: 'ซ่อมบำรุง',
    shortLabelTh: 'ซ่อมบำรุง',
    priority: 5,
    isTerminal: false,
    isMaintenance: true,
    needsTracking: true,
    tone: 'info',
    icon: 'fa-tools',
  },
  NORMAL: {
    code: 'NORMAL',
    labelTh: 'ปกติ',
    shortLabelTh: 'ปกติ',
    priority: 6,
    isTerminal: false,
    isMaintenance: false,
    needsTracking: false,
    tone: 'success',
    icon: 'fa-circle-check',
  },
  DECOMMISSIONED: {
    code: 'DECOMMISSIONED',
    labelTh: 'ยุบสภาพรอจำหน่าย',
    shortLabelTh: 'ยุบสภาพรอจำหน่าย',
    priority: 7,
    isTerminal: true,
    isMaintenance: false,
    needsTracking: false,
    tone: 'muted',
    icon: 'fa-box-archive',
  },
  DISPOSED: {
    code: 'DISPOSED',
    labelTh: 'จำหน่าย',
    shortLabelTh: 'จำหน่าย',
    priority: 8,
    isTerminal: true,
    isMaintenance: false,
    needsTracking: false,
    tone: 'muted',
    icon: 'fa-ban',
  },
};

export const TERMINAL_STATUS_CODES: ReadonlySet<VehicleStatusCode> = new Set([
  'DECOMMISSIONED',
  'DISPOSED',
]);

/**
 * Deterministic 8-status computation mirroring PostgreSQL `vehicleapp.fn_compute_vehicle_status`
 * and legacy GAS `Domain.js` rules.
 */
export function computeVehicleStatus(params: {
  expiryDateIso: string | null | undefined;
  isUnderMaintenance?: boolean;
  currentStatus?: VehicleStatusCode;
  warningDays?: number;
  todayIso?: string;
}): VehicleStatusCode {
  const {
    expiryDateIso,
    isUnderMaintenance = false,
    currentStatus = 'NORMAL',
    warningDays = 45,
    todayIso = getTodayIsoBangkok(),
  } = params;

  if (TERMINAL_STATUS_CODES.has(currentStatus)) {
    return currentStatus;
  }

  const maint =
    isUnderMaintenance ||
    currentStatus === 'MAINTENANCE' ||
    currentStatus === 'MAINTENANCE_WARNING' ||
    currentStatus === 'MAINTENANCE_EXPIRED';

  if (!expiryDateIso || !/^\d{4}-\d{2}-\d{2}$/.test(expiryDateIso)) {
    return maint ? 'MAINTENANCE' : 'NORMAL';
  }

  const todayMs = Date.parse(`${todayIso}T00:00:00Z`);
  const expiryMs = Date.parse(`${expiryDateIso}T00:00:00Z`);
  if (Number.isNaN(todayMs) || Number.isNaN(expiryMs)) {
    return maint ? 'MAINTENANCE' : 'NORMAL';
  }

  const diffDays = Math.ceil((expiryMs - todayMs) / 86_400_000);
  if (diffDays < 0) {
    return maint ? 'MAINTENANCE_EXPIRED' : 'EXPIRED';
  }
  if (diffDays <= warningDays) {
    return maint ? 'MAINTENANCE_WARNING' : 'WARNING';
  }
  return maint ? 'MAINTENANCE' : 'NORMAL';
}

export interface ActivityTypeMeta {
  code: ActivityTypeCode;
  labelTh: string;
  shortLabelTh: string;
  icon: string;
  superAdminOnly?: boolean;
  hint: string;
}

export const ACTIVITY_TYPE_MAP: Record<ActivityTypeCode, ActivityTypeMeta> = {
  TAX_RENEWAL: {
    code: 'TAX_RENEWAL',
    labelTh: 'ต่ออายุภาษี / ใบอนุญาตเรือ',
    shortLabelTh: 'ต่ออายุภาษี',
    icon: 'fa-file-circle-check',
    hint: 'อัปเดตวันสิ้นอายุใหม่ (หากยังอยู่ระหว่างซ่อมบำรุง ระบบจะคงสถานะซ่อมบำรุงควบคู่กับวันสิ้นอายุใหม่)',
  },
  MAINTENANCE_SEND: {
    code: 'MAINTENANCE_SEND',
    labelTh: 'รายงานการซ่อมบำรุง (ส่งซ่อม)',
    shortLabelTh: 'ส่งซ่อมบำรุง',
    icon: 'fa-screwdriver-wrench',
    hint: 'เปลี่ยนสถานะเป็นซ่อมบำรุง (หรือซ่อมบำรุงควบคู่กับสถานะหมดอายุเดิม) พร้อมบันทึกสถานที่/อู่ซ่อม',
  },
  MAINTENANCE_COMPLETE: {
    code: 'MAINTENANCE_COMPLETE',
    labelTh: 'รายงานการซ่อมบำรุง (รายงานผลการซ่อม)',
    shortLabelTh: 'รายงานผลการซ่อม',
    icon: 'fa-circle-check',
    hint: 'ปลดสถานะซ่อมบำรุง และคำนวณสถานะใหม่จากวันสิ้นอายุปัจจุบันโดยอัตโนมัติ',
  },
  DECOMMISSION: {
    code: 'DECOMMISSION',
    labelTh: 'ยุบสภาพรอจำหน่าย',
    shortLabelTh: 'ยุบสภาพรอจำหน่าย',
    icon: 'fa-box-archive',
    hint: 'เปลี่ยนเป็นสถานะสิ้นสุด "ยุบสภาพรอจำหน่าย" และหยุดแจ้งเตือนวันหมดอายุ',
  },
  DISPOSE: {
    code: 'DISPOSE',
    labelTh: 'จำหน่าย',
    shortLabelTh: 'จำหน่าย',
    icon: 'fa-ban',
    hint: 'เปลี่ยนเป็นสถานะสิ้นสุด "จำหน่าย" บันทึกวันที่จำหน่าย และหยุดแจ้งเตือนวันหมดอายุ',
  },
  RESTORE_NORMAL: {
    code: 'RESTORE_NORMAL',
    labelTh: 'แก้ไขสถานะ (กลับเป็นปกติ)',
    shortLabelTh: 'คืนสถานะปกติ',
    icon: 'fa-rotate-left',
    superAdminOnly: true,
    hint: 'สงวนสิทธิ์เฉพาะผู้ดูแลระบบสูงสุด (SUPERADMIN / APP_ADMIN) ใช้คืนสถานะจากยุบสภาพหรือจำหน่ายกลับสู่การคำนวณปกติ',
  },
};

export const ACTIVITY_TYPE_LIST: ActivityTypeMeta[] = [
  ACTIVITY_TYPE_MAP.TAX_RENEWAL,
  ACTIVITY_TYPE_MAP.MAINTENANCE_SEND,
  ACTIVITY_TYPE_MAP.MAINTENANCE_COMPLETE,
  ACTIVITY_TYPE_MAP.DECOMMISSION,
  ACTIVITY_TYPE_MAP.DISPOSE,
  ACTIVITY_TYPE_MAP.RESTORE_NORMAL,
];

export const ALL_VEHICLE_STATUS_ORDER: VehicleStatusCode[] = [
  'EXPIRED',
  'MAINTENANCE_EXPIRED',
  'WARNING',
  'MAINTENANCE_WARNING',
  'MAINTENANCE',
  'NORMAL',
  'DECOMMISSIONED',
  'DISPOSED',
];

/**
 * Filter vehicles eligible for a given activity type, strictly mirroring
 * PostgreSQL `vehicleapp.fn_record_vehicle_activity` terminal-state guards
 * and legacy GAS `view-renewals.html` workflow rules.
 */
export function getEligibleVehiclesForActivity(
  vehicles: VehicleEnrichedRow[],
  activityType: ActivityTypeCode,
  options?: { includeNormalForTaxRenewal?: boolean }
): VehicleEnrichedRow[] {
  const includeNormalForTax = options?.includeNormalForTaxRenewal ?? false;

  return vehicles.filter((v) => {
    const st = v.computed_status_code || v.status_code;

    switch (activityType) {
      case 'TAX_RENEWAL': {
        if (TERMINAL_STATUS_CODES.has(st)) return false;
        if (includeNormalForTax) return true;
        return (
          st === 'EXPIRED' ||
          st === 'WARNING' ||
          st === 'MAINTENANCE_EXPIRED' ||
          st === 'MAINTENANCE_WARNING'
        );
      }
      case 'MAINTENANCE_SEND':
        return (
          !TERMINAL_STATUS_CODES.has(st) &&
          st !== 'MAINTENANCE' &&
          st !== 'MAINTENANCE_WARNING' &&
          st !== 'MAINTENANCE_EXPIRED' &&
          !v.is_under_maintenance
        );
      case 'MAINTENANCE_COMPLETE':
        return (
          st === 'MAINTENANCE' ||
          st === 'MAINTENANCE_WARNING' ||
          st === 'MAINTENANCE_EXPIRED' ||
          v.is_under_maintenance
        );
      case 'DECOMMISSION':
        return !TERMINAL_STATUS_CODES.has(st);
      case 'DISPOSE':
        return st !== 'DISPOSED';
      case 'RESTORE_NORMAL':
        return st === 'DECOMMISSIONED' || st === 'DISPOSED';
      default:
        return false;
    }
  });
}

export function buildNotificationRefKey(vehicle: Pick<VehicleEnrichedRow, 'id' | 'status_code' | 'computed_status_code' | 'current_expiry_date'>): string {
  const st = vehicle.computed_status_code || vehicle.status_code;
  return `${vehicle.id}:${st}:${vehicle.current_expiry_date || ''}`;
}

