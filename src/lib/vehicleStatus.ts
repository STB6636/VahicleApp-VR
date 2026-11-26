import type { VehicleStatusCode } from '@/types/vehicle.types';
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
