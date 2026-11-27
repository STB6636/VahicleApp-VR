import { describe, expect, it } from 'vitest';
import {
  buildNotificationRefKey,
  getEligibleVehiclesForActivity,
} from '@/lib/vehicleStatus';
import { filterCaretakerCandidates } from '@/components/common/SmartCaretakerCombobox';
import { buildVehicleNotifications } from '@/components/common/NotificationBell';
import type { PortalPersonnelDirectoryRow, VehicleEnrichedRow } from '@/types/vehicle.types';

function makeVehicle(overrides: Partial<VehicleEnrichedRow>): VehicleEnrichedRow {
  return {
    id: overrides.id ?? 'v-1',
    vehicle_code: overrides.vehicle_code ?? 'VH0001',
    vehicle_type_id: 'vt-car',
    vehicle_type_code: overrides.vehicle_type_code ?? 'CAR',
    vehicle_type_name: overrides.vehicle_type_name ?? 'รถยนต์',
    is_vessel: overrides.is_vessel ?? false,
    vehicle_type_icon: 'fa-car-side',
    license_plate: '1กข 1234',
    province: 'กรุงเทพมหานคร',
    vessel_name: null,
    vessel_license_no: null,
    vehicle_label: overrides.vehicle_label ?? '1กข 1234 กรุงเทพมหานคร',
    brand: 'Toyota',
    model: 'Hilux',
    model_year: 2566,
    engine_cc: 2400,
    price: 800000,
    acquisition_date: '2023-01-01',
    disposal_date: null,
    current_expiry_date: overrides.current_expiry_date ?? '2026-12-31',
    days_until_expiry: overrides.days_until_expiry ?? 30,
    office_id: 'off-1',
    office_name: 'สำนักงานตรวจและบังคับการ',
    department_id: 'dept-1',
    department_name: 'ฝ่ายบริหารงานทั่วไป',
    division_id: null,
    division_name: null,
    caretaker_personnel_id: null,
    caretaker_name: null,
    caretaker_position_display: null,
    caretaker_position: null,
    caretaker_level: null,
    status_code: overrides.status_code ?? 'NORMAL',
    computed_status_code: overrides.computed_status_code ?? overrides.status_code ?? 'NORMAL',
    is_under_maintenance: overrides.is_under_maintenance ?? false,
    attachment_folder_id: null,
    latest_file_url: null,
    remarks: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

describe('Phase 2: Activity eligibility & terminal state rules', () => {
  const fleet: VehicleEnrichedRow[] = [
    makeVehicle({ id: 'v-normal', status_code: 'NORMAL', current_expiry_date: '2027-06-01' }),
    makeVehicle({ id: 'v-warn', status_code: 'WARNING', current_expiry_date: '2026-12-10' }),
    makeVehicle({ id: 'v-exp', status_code: 'EXPIRED', current_expiry_date: '2026-11-01' }),
    makeVehicle({ id: 'v-maint', status_code: 'MAINTENANCE', is_under_maintenance: true }),
    makeVehicle({ id: 'v-mw', status_code: 'MAINTENANCE_WARNING', is_under_maintenance: true }),
    makeVehicle({ id: 'v-me', status_code: 'MAINTENANCE_EXPIRED', is_under_maintenance: true }),
    makeVehicle({ id: 'v-decomm', status_code: 'DECOMMISSIONED' }),
    makeVehicle({ id: 'v-disp', status_code: 'DISPOSED' }),
  ];

  it('filters TAX_RENEWAL to warning/expired (including maintenance) by default, excluding terminal', () => {
    const ids = getEligibleVehiclesForActivity(fleet, 'TAX_RENEWAL').map((v) => v.id);
    expect(ids).toEqual(['v-warn', 'v-exp', 'v-mw', 'v-me']);

    const withEarly = getEligibleVehiclesForActivity(fleet, 'TAX_RENEWAL', {
      includeNormalForTaxRenewal: true,
    }).map((v) => v.id);
    expect(withEarly).toEqual(['v-normal', 'v-warn', 'v-exp', 'v-maint', 'v-mw', 'v-me']);
    expect(withEarly).not.toContain('v-decomm');
    expect(withEarly).not.toContain('v-disp');
  });

  it('enforces maintenance & terminal transition boundaries', () => {
    expect(getEligibleVehiclesForActivity(fleet, 'MAINTENANCE_SEND').map((v) => v.id)).toEqual([
      'v-normal',
      'v-warn',
      'v-exp',
    ]);
    expect(getEligibleVehiclesForActivity(fleet, 'MAINTENANCE_COMPLETE').map((v) => v.id)).toEqual([
      'v-maint',
      'v-mw',
      'v-me',
    ]);
    expect(getEligibleVehiclesForActivity(fleet, 'DECOMMISSION').map((v) => v.id)).toEqual([
      'v-normal',
      'v-warn',
      'v-exp',
      'v-maint',
      'v-mw',
      'v-me',
    ]);
    // DISPOSE allows decommissioned + active, but not already DISPOSED
    expect(getEligibleVehiclesForActivity(fleet, 'DISPOSE').map((v) => v.id)).toContain('v-decomm');
    expect(getEligibleVehiclesForActivity(fleet, 'DISPOSE').map((v) => v.id)).not.toContain('v-disp');

    // RESTORE_NORMAL strictly targets terminal states
    expect(getEligibleVehiclesForActivity(fleet, 'RESTORE_NORMAL').map((v) => v.id)).toEqual([
      'v-decomm',
      'v-disp',
    ]);
  });
});

describe('Phase 2: Smart Caretaker Filter', () => {
  const personnel: PortalPersonnelDirectoryRow[] = [
    {
      id: 'p-1',
      full_name: 'นายสมชาย ขับดี',
      position_name: 'พนักงานขับรถยนต์',
      office_id: 'off-1',
      department_id: 'dept-1',
    },
    {
      id: 'p-2',
      full_name: 'นายสมศักดิ์ เดินเรือ',
      position_name: 'นายท้ายเรือ',
      office_id: 'off-1',
      department_id: 'dept-1',
    },
    {
      id: 'p-3',
      full_name: 'นางสาวสุดา ธุรการ',
      position_name: 'เจ้าพนักงานธุรการชำนาญงาน',
      office_id: 'off-1',
      department_id: 'dept-1',
    },
    {
      id: 'p-4',
      full_name: 'นายประสิทธิ์ ต่างฝ่าย',
      position_name: 'พนักงานขับรถยนต์',
      office_id: 'off-1',
      department_id: 'dept-2',
    },
  ];

  it('filters drivers for cars and helmsmen for vessels within same department', () => {
    const carCandidates = filterCaretakerCandidates({
      personnel,
      officeId: 'off-1',
      departmentId: 'dept-1',
      defaultPosition: 'พนักงานขับรถยนต์',
      showAllInOrg: false,
    });
    expect(carCandidates.map((p) => p.id)).toEqual(['p-1']);

    const vesselCandidates = filterCaretakerCandidates({
      personnel,
      officeId: 'off-1',
      departmentId: 'dept-1',
      defaultPosition: 'นายท้ายเรือ',
      showAllInOrg: false,
    });
    expect(vesselCandidates.map((p) => p.id)).toEqual(['p-2']);
  });

  it('unlocks all personnel in the department when showAllInOrg is enabled', () => {
    const allInDept1 = filterCaretakerCandidates({
      personnel,
      officeId: 'off-1',
      departmentId: 'dept-1',
      defaultPosition: 'พนักงานขับรถยนต์',
      showAllInOrg: true,
    });
    expect(allInDept1.map((p) => p.id)).toEqual(['p-1', 'p-2', 'p-3']);
  });
});

describe('Phase 2: Notification Bell builder & ref_key stability', () => {
  it('excludes normal, maintenance-only, and terminal vehicles and sorts unread expired first', () => {
    const vExp = makeVehicle({ id: 'v-exp', status_code: 'EXPIRED', current_expiry_date: '2026-10-01' });
    const vWarn = makeVehicle({ id: 'v-warn', status_code: 'WARNING', current_expiry_date: '2026-12-01' });
    const vNorm = makeVehicle({ id: 'v-norm', status_code: 'NORMAL', current_expiry_date: '2027-05-01' });
    const vDisp = makeVehicle({ id: 'v-disp', status_code: 'DISPOSED', current_expiry_date: '2025-01-01' });

    const readSet = new Set([buildNotificationRefKey(vExp)]);
    const items = buildVehicleNotifications([vNorm, vDisp, vWarn, vExp], readSet);

    expect(items.map((i) => i.vehicle.id)).toEqual(['v-warn', 'v-exp']);
    expect(items[0].isRead).toBe(false);
    expect(items[1].isRead).toBe(true);
  });

  it('generates a new ref_key when status escalates from WARNING to EXPIRED', () => {
    const kWarn = buildNotificationRefKey(
      makeVehicle({ id: 'v-1', status_code: 'WARNING', current_expiry_date: '2026-11-28' })
    );
    const kExp = buildNotificationRefKey(
      makeVehicle({ id: 'v-1', status_code: 'EXPIRED', current_expiry_date: '2026-11-28' })
    );
    expect(kWarn).not.toBe(kExp);
  });
});
