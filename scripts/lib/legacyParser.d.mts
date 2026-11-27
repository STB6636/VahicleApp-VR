export interface LegacyStatusMapping {
  status_code:
    | 'NORMAL'
    | 'WARNING'
    | 'EXPIRED'
    | 'MAINTENANCE'
    | 'MAINTENANCE_WARNING'
    | 'MAINTENANCE_EXPIRED'
    | 'DECOMMISSIONED'
    | 'DISPOSED';
  is_under_maintenance: boolean;
}

export function parseCsvRecords(csvText: string): Array<Record<string, string>>;
export function normalizeLegacyDate(rawValue: string | number | null | undefined): string | null;
export function mapLegacyStatus(rawStatus: string | null | undefined): LegacyStatusMapping;
export function mapLegacyVehicleTypeCode(rawType: string | null | undefined): string;
export function mapLegacyActivityType(rawType: string | null | undefined): string;
export function normalizeThaiName(str: string | null | undefined): string;

export function resolveOrgUnitMatch(
  divisionName: string | null | undefined,
  orgUnits: Array<{ id: string; parent_id: string | null; level_no: number; name_th: string }>
): { office_id: string | null; department_id: string | null; division_id: string | null };

export function transformLegacyVehicleRow(
  row: Record<string, string>,
  context: {
    vehicleTypesByCode: Map<string, { id: string; code: string }>;
    orgUnits: Array<{ id: string; parent_id: string | null; level_no: number; name_th: string }>;
    personnelDirectory: Array<{ id: string; full_name: string }>;
    legacyPersonnelById?: Map<string, Record<string, string>>;
  }
):
  | { ok: false; error: string }
  | { ok: true; warnings: string[]; record: Record<string, unknown> };

export function transformLegacyActivityRow(
  row: Record<string, string>,
  vehicleIdByCode: Map<string, string>
):
  | { ok: false; error: string }
  | { ok: true; record: Record<string, unknown> };

export function extractMaxSequenceNumber(codes: Array<string | null | undefined>, prefix: string): number;
