import { describe, expect, it } from 'vitest';
import {
  computeNineStatusSummary,
  filterReportVehicles,
  groupCarsForReport,
  groupVesselsForReport,
} from '@/lib/reportUtils';
import {
  extractGoogleDriveId,
  MAX_DRIVE_BRIDGE_FILE_MB,
  validateAttachmentFile,
} from '@/services/driveBridgeService';
import type { VehicleEnrichedRow } from '@/types/vehicle.types';

function makeRow(partial: Partial<VehicleEnrichedRow>): VehicleEnrichedRow {
  return {
    id: partial.id ?? 'id-1',
    vehicle_code: partial.vehicle_code ?? 'VH0001',
    vehicle_type_id: 'vt-1',
    vehicle_type_code: partial.vehicle_type_code ?? 'CAR',
    vehicle_type_name: partial.vehicle_type_name ?? 'รถยนต์',
    is_vessel: partial.is_vessel ?? false,
    vehicle_type_icon: 'fa-car-side',
    license_plate: partial.license_plate ?? 'กท 1001',
    province: 'กรุงเทพมหานคร',
    vessel_name: partial.vessel_name ?? null,
    vessel_license_no: partial.vessel_license_no ?? null,
    vehicle_label: partial.vehicle_label ?? 'กท 1001 กรุงเทพมหานคร',
    brand: null,
    model: null,
    model_year: null,
    engine_cc: null,
    price: null,
    acquisition_date: null,
    disposal_date: null,
    current_expiry_date: partial.current_expiry_date ?? '2026-12-31',
    days_until_expiry: 10,
    office_id: 'off-1',
    office_name: 'สำนักงานตรวจและบังคับการ',
    department_id: 'dept-1',
    department_name: partial.department_name ?? 'ฝ่ายบริหารงานทั่วไป',
    division_id: null,
    division_name: null,
    caretaker_personnel_id: null,
    caretaker_name: null,
    caretaker_position_display: null,
    caretaker_position: null,
    caretaker_level: null,
    status_code: partial.status_code ?? 'NORMAL',
    computed_status_code: partial.computed_status_code ?? partial.status_code ?? 'NORMAL',
    is_under_maintenance: false,
    attachment_folder_id: null,
    latest_file_url: null,
    remarks: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

describe('Phase 3: Report grouping & 9-status summary', () => {
  const sample: VehicleEnrichedRow[] = [
    makeRow({ id: 'c1', vehicle_type_name: 'รถยนต์', department_name: 'ฝ่าย ก', status_code: 'EXPIRED' }),
    makeRow({ id: 'c2', vehicle_type_name: 'รถจักรยานยนต์', department_name: 'ฝ่าย ก', status_code: 'NORMAL' }),
    makeRow({ id: 'c3', vehicle_type_name: 'รถยนต์', department_name: 'ฝ่าย ข', status_code: 'MAINTENANCE_WARNING' }),
    makeRow({ id: 'v1', is_vessel: true, vehicle_type_code: 'VESSEL', vehicle_type_name: 'เรือ', vessel_name: 'เรือ 1', department_name: 'ฝ่าย ข', status_code: 'WARNING' }),
    makeRow({ id: 'v2', is_vessel: true, vehicle_type_code: 'VESSEL', vehicle_type_name: 'เรือ', vessel_name: 'เรือ 2', department_name: 'ฝ่าย ข', status_code: 'DISPOSED' }),
  ];

  it('computes all 9 summary counters accurately', () => {
    const summary = computeNineStatusSummary(sample);
    expect(summary).toEqual({
      total: 5,
      normal: 1,
      warning: 1,
      expired: 1,
      maintenance: 0,
      maintenance_warning: 1,
      maintenance_expired: 0,
      decommissioned: 0,
      disposed: 1,
    });
  });

  it('filters by category, status, and department and groups cars/vessels strictly', () => {
    const { cars, vessels } = filterReportVehicles(sample, {
      category: 'all',
      status: 'all',
      department: 'all',
    });
    expect(cars).toHaveLength(3);
    expect(vessels).toHaveLength(2);

    const carGroups = groupCarsForReport(cars);
    expect(carGroups.map((g) => g.department)).toEqual(['ฝ่าย ก', 'ฝ่าย ข']);
    expect(carGroups[0].types.map((t) => t.vehicleTypeName)).toHaveLength(2);

    const vesselGroups = groupVesselsForReport(vessels);
    expect(vesselGroups).toHaveLength(1);
    expect(vesselGroups[0].department).toBe('ฝ่าย ข');
    // WARNING priority (3) precedes DISPOSED priority (8)
    expect(vesselGroups[0].statuses.map((s) => s.statusCode)).toEqual(['WARNING', 'DISPOSED']);

    const onlyVessels = filterReportVehicles(sample, {
      category: 'vessel',
      status: 'WARNING',
      department: 'ฝ่าย ข',
    });
    expect(onlyVessels.cars).toHaveLength(0);
    expect(onlyVessels.vessels.map((v) => v.id)).toEqual(['v1']);
  });
});

describe('Phase 3: Google Drive Bridge helpers', () => {
  it('extracts Google Drive folder/file IDs from URLs and raw IDs', () => {
    expect(extractGoogleDriveId('https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz')).toBe(
      '1AbCdEfGhIjKlMnOpQrStUvWxYz'
    );
    expect(extractGoogleDriveId('https://drive.google.com/file/d/1XyZ9876543210AbCdEf/view?usp=sharing')).toBe(
      '1XyZ9876543210AbCdEf'
    );
    expect(extractGoogleDriveId('https://drive.google.com/open?id=1PqRsTuVwXyZ123456')).toBe(
      '1PqRsTuVwXyZ123456'
    );
    expect(extractGoogleDriveId('1RawFolderId_12345')).toBe('1RawFolderId_12345');
    expect(extractGoogleDriveId('bad')).toBe('');
  });

  it('validates allowed MIME types and file size limits (capped at GAS Drive Bridge 15 MB ceiling)', () => {
    expect(MAX_DRIVE_BRIDGE_FILE_MB).toBe(15);
    expect(validateAttachmentFile({ name: 'doc.pdf', type: 'application/pdf', size: 1024 }, 10).valid).toBe(true);
    expect(validateAttachmentFile({ name: 'img.png', type: 'image/png', size: 5 * 1024 * 1024 }, 10).valid).toBe(true);
    expect(validateAttachmentFile({ name: 'bad.svg', type: 'image/svg+xml', size: 500 }, 10).valid).toBe(false);
    expect(validateAttachmentFile({ name: 'huge.pdf', type: 'application/pdf', size: 11 * 1024 * 1024 }, 10).valid).toBe(false);
    // Exact 15 MB ceiling passes; anything above 15 MB is rejected even if caller passes 20 MB
    expect(validateAttachmentFile({ name: 'max.pdf', type: 'application/pdf', size: 15 * 1024 * 1024 }, 15).valid).toBe(true);
    const overCeiling = validateAttachmentFile({ name: 'over.pdf', type: 'application/pdf', size: 16 * 1024 * 1024 }, 20);
    expect(overCeiling.valid).toBe(false);
    expect(overCeiling.error).toContain('15 MB');
  });
});
