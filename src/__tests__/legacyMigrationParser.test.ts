import { describe, expect, it } from 'vitest';
import {
  extractMaxSequenceNumber,
  normalizeLegacyDate,
  parseCsvRecords,
  resolveOrgUnitMatch,
  transformLegacyActivityRow,
  transformLegacyVehicleRow,
} from '../../scripts/lib/legacyParser.mjs';

describe('Phase 4: Legacy Google Sheets migration parser', () => {
  it('parses RFC-4180 CSV with BOM, quoted commas, and escaped quotes', () => {
    const csv =
      '\uFEFFVehicle_ID,Vehicle_Type,Remarks\r\n' +
      'VH0001,รถยนต์,"รถกระบะ, ""สภาพดี"""\r\n' +
      'VH0002,เรือ,"เรือตรวจการณ์"\r\n';
    const rows = parseCsvRecords(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      Vehicle_ID: 'VH0001',
      Vehicle_Type: 'รถยนต์',
      Remarks: 'รถกระบะ, "สภาพดี"',
    });
  });

  it('normalizes ISO, Buddhist Era DD/MM/BBBB, CE DD/MM/YYYY, and Excel serial dates', () => {
    expect(normalizeLegacyDate('2026-09-30')).toBe('2026-09-30');
    expect(normalizeLegacyDate('30/09/2569')).toBe('2026-09-30');
    expect(normalizeLegacyDate('01/03/2026')).toBe('2026-03-01');
    expect(normalizeLegacyDate('46022')).toBe('2025-12-31');
    expect(normalizeLegacyDate('31/02/2569')).toBeNull();
    expect(normalizeLegacyDate('')).toBeNull();
  });

  it('transforms legacy car and vessel rows with org & caretaker matching', () => {
    const vehicleTypesByCode = new Map([
      ['CAR', { id: 'vt-car', code: 'CAR' }],
      ['VESSEL', { id: 'vt-vessel', code: 'VESSEL' }],
    ]);
    const orgUnits = [
      { id: 'off-1', parent_id: null, level_no: 2, name_th: 'สำนักงานตรวจและบังคับการ' },
      { id: 'dept-1', parent_id: 'off-1', level_no: 3, name_th: 'ส่วนตรวจและบังคับการ 1' },
    ];
    const personnelDirectory = [
      { id: 'per-1', full_name: 'นายสมชาย ใจดี' },
    ];
    const legacyPersonnelById = new Map([
      ['PS0001', { Personnel_ID: 'PS0001', Prefix: 'นาย', First_Name: 'สมชาย', Last_Name: 'ใจดี' }],
    ]);

    const res = transformLegacyVehicleRow(
      {
        Vehicle_ID: 'VH0015',
        Vehicle_Type: 'รถยนต์',
        License_Plate: '1กข 9999',
        Province: 'กรุงเทพมหานคร',
        Current_Expiry_Date: '30/09/2569',
        Division: 'ส่วนตรวจและบังคับการ 1',
        Personnel_ID: 'PS0001',
        Status: 'ซ่อมบำรุง กำลังจะขาดต่ออายุ',
        Price: '850,000',
      },
      { vehicleTypesByCode, orgUnits, personnelDirectory, legacyPersonnelById }
    );

    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.error);
    expect(res.warnings).toEqual([]);
    expect(res.record.vehicle_code).toBe('VH0015');
    expect(res.record.status_code).toBe('MAINTENANCE_WARNING');
    expect(res.record.is_under_maintenance).toBe(true);
    expect(res.record.office_id).toBe('off-1');
    expect(res.record.department_id).toBe('dept-1');
    expect(res.record.caretaker_personnel_id).toBe('per-1');
    expect(res.record.price).toBe(850000);

    // Invalid date rejects cleanly
    const bad = transformLegacyVehicleRow(
      { Vehicle_ID: 'VH0099', Vehicle_Type: 'เรือ', Current_Expiry_Date: 'not-a-date' },
      { vehicleTypesByCode, orgUnits, personnelDirectory, legacyPersonnelById }
    );
    expect(bad.ok).toBe(false);
  });

  it('transforms legacy activities and strips legacy Recorded_By timestamp suffix', () => {
    const vehicleIdByCode = new Map([['VH0015', 'uuid-vh-15']]);
    const res = transformLegacyActivityRow(
      {
        Activity_ID: 'ACT0042',
        Vehicle_ID: 'VH0015',
        Activity_Type: 'รายงานการซ่อมบำรุง (ส่งซ่อม)',
        Document_No: 'บส.12/2569',
        Start_Date: '15/11/2569',
        Location: 'กองโรงงานช่างกล',
        Recorded_By: 'นายสมชาย ใจดี / 2026-11-15 10:30:00',
        Recorded_At: '2026-11-15',
      },
      vehicleIdByCode
    );

    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.error);
    expect(res.record.activity_type).toBe('MAINTENANCE_SEND');
    expect(res.record.recorded_by_name).toBe('นายสมชาย ใจดี');
    expect(res.record.vehicle_id).toBe('uuid-vh-15');
  });

  it('resolves org hierarchy and calculates max sequence numbers safely', () => {
    const orgs = [
      { id: 'off-1', parent_id: null, level_no: 2, name_th: 'สำนักงานตรวจและบังคับการ' },
      { id: 'dept-1', parent_id: 'off-1', level_no: 3, name_th: 'ส่วนตรวจ 1' },
      { id: 'div-1', parent_id: 'dept-1', level_no: 4, name_th: 'กลุ่มงานปฏิบัติการ' },
    ];
    expect(resolveOrgUnitMatch('กลุ่มงานปฏิบัติการ', orgs)).toEqual({
      office_id: 'off-1',
      department_id: 'dept-1',
      division_id: 'div-1',
    });
    expect(extractMaxSequenceNumber(['VH0001', 'VH0042', 'VH0009', 'INVALID'], 'VH')).toBe(42);
  });
});
