import { VEHICLE_STATUS_MAP } from '@/lib/vehicleStatus';
import type { VehicleEnrichedRow, VehicleStatusCode } from '@/types/vehicle.types';

export type ReportCategoryFilter = 'all' | 'car' | 'vessel';

export interface ReportFilterOptions {
  category: ReportCategoryFilter;
  status: 'all' | VehicleStatusCode;
  department: 'all' | string;
}

export interface NineStatusSummary {
  total: number;
  normal: number;
  warning: number;
  expired: number;
  maintenance: number;
  maintenance_warning: number;
  maintenance_expired: number;
  decommissioned: number;
  disposed: number;
}

export interface CarReportGroup {
  department: string;
  types: Array<{
    vehicleTypeName: string;
    statuses: Array<{
      statusCode: VehicleStatusCode;
      statusLabelTh: string;
      rows: VehicleEnrichedRow[];
    }>;
  }>;
}

export interface VesselReportGroup {
  department: string;
  statuses: Array<{
    statusCode: VehicleStatusCode;
    statusLabelTh: string;
    rows: VehicleEnrichedRow[];
  }>;
}

export function resolveVehicleOrgLabel(v: VehicleEnrichedRow): string {
  return (v.department_name || v.office_name || 'ไม่ระบุส่วนราชการ').trim();
}

export function filterReportVehicles(
  vehicles: VehicleEnrichedRow[],
  filter: ReportFilterOptions
): { cars: VehicleEnrichedRow[]; vessels: VehicleEnrichedRow[]; all: VehicleEnrichedRow[] } {
  const matched = vehicles.filter((v) => {
    const st = v.computed_status_code || v.status_code;
    if (filter.status !== 'all' && st !== filter.status) return false;
    if (filter.department !== 'all' && resolveVehicleOrgLabel(v) !== filter.department) {
      return false;
    }
    return true;
  });

  const cars = filter.category === 'vessel' ? [] : matched.filter((v) => !v.is_vessel);
  const vessels = filter.category === 'car' ? [] : matched.filter((v) => v.is_vessel);

  return { cars, vessels, all: [...cars, ...vessels] };
}

export function computeNineStatusSummary(vehicles: VehicleEnrichedRow[]): NineStatusSummary {
  const summary: NineStatusSummary = {
    total: vehicles.length,
    normal: 0,
    warning: 0,
    expired: 0,
    maintenance: 0,
    maintenance_warning: 0,
    maintenance_expired: 0,
    decommissioned: 0,
    disposed: 0,
  };

  for (const v of vehicles) {
    const st = v.computed_status_code || v.status_code;
    if (st === 'NORMAL') summary.normal += 1;
    else if (st === 'WARNING') summary.warning += 1;
    else if (st === 'EXPIRED') summary.expired += 1;
    else if (st === 'MAINTENANCE') summary.maintenance += 1;
    else if (st === 'MAINTENANCE_WARNING') summary.maintenance_warning += 1;
    else if (st === 'MAINTENANCE_EXPIRED') summary.maintenance_expired += 1;
    else if (st === 'DECOMMISSIONED') summary.decommissioned += 1;
    else if (st === 'DISPOSED') summary.disposed += 1;
  }

  return summary;
}

/**
 * Group Cars strictly by: ส่วนราชการ -> ประเภทยานพาหนะ -> สถานะ
 */
export function groupCarsForReport(cars: VehicleEnrichedRow[]): CarReportGroup[] {
  const deptMap = new Map<string, Map<string, Map<VehicleStatusCode, VehicleEnrichedRow[]>>>();

  for (const v of cars) {
    const dept = resolveVehicleOrgLabel(v);
    const typeName = v.vehicle_type_name || 'ไม่ระบุประเภท';
    const st = v.computed_status_code || v.status_code;

    if (!deptMap.has(dept)) deptMap.set(dept, new Map());
    const typeMap = deptMap.get(dept)!;
    if (!typeMap.has(typeName)) typeMap.set(typeName, new Map());
    const statusMap = typeMap.get(typeName)!;
    if (!statusMap.has(st)) statusMap.set(st, []);
    statusMap.get(st)!.push(v);
  }

  return Array.from(deptMap.entries())
    .sort(([a], [b]) => a.localeCompare(b, 'th'))
    .map(([department, typeMap]) => ({
      department,
      types: Array.from(typeMap.entries())
        .sort(([a], [b]) => a.localeCompare(b, 'th'))
        .map(([vehicleTypeName, statusMap]) => ({
          vehicleTypeName,
          statuses: Array.from(statusMap.entries())
            .sort(([a], [b]) => (VEHICLE_STATUS_MAP[a]?.priority ?? 99) - (VEHICLE_STATUS_MAP[b]?.priority ?? 99))
            .map(([statusCode, rows]) => ({
              statusCode,
              statusLabelTh: VEHICLE_STATUS_MAP[statusCode]?.labelTh ?? statusCode,
              rows: rows.sort((x, y) =>
                String(x.current_expiry_date || '').localeCompare(String(y.current_expiry_date || ''))
              ),
            })),
        })),
    }));
}

/**
 * Group Vessels strictly by: ส่วนราชการ -> สถานะ
 */
export function groupVesselsForReport(vessels: VehicleEnrichedRow[]): VesselReportGroup[] {
  const deptMap = new Map<string, Map<VehicleStatusCode, VehicleEnrichedRow[]>>();

  for (const v of vessels) {
    const dept = resolveVehicleOrgLabel(v);
    const st = v.computed_status_code || v.status_code;

    if (!deptMap.has(dept)) deptMap.set(dept, new Map());
    const statusMap = deptMap.get(dept)!;
    if (!statusMap.has(st)) statusMap.set(st, []);
    statusMap.get(st)!.push(v);
  }

  return Array.from(deptMap.entries())
    .sort(([a], [b]) => a.localeCompare(b, 'th'))
    .map(([department, statusMap]) => ({
      department,
      statuses: Array.from(statusMap.entries())
        .sort(([a], [b]) => (VEHICLE_STATUS_MAP[a]?.priority ?? 99) - (VEHICLE_STATUS_MAP[b]?.priority ?? 99))
        .map(([statusCode, rows]) => ({
          statusCode,
          statusLabelTh: VEHICLE_STATUS_MAP[statusCode]?.labelTh ?? statusCode,
          rows: rows.sort((x, y) =>
            String(x.current_expiry_date || '').localeCompare(String(y.current_expiry_date || ''))
          ),
        })),
    }));
}
