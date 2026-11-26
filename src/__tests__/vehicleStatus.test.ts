import { describe, it, expect } from 'vitest';
import { computeVehicleStatus } from '@/lib/vehicleStatus';

describe('computeVehicleStatus (8-status engine aligned with Ex Project & SQL)', () => {
  const todayIso = '2026-11-26';

  it('returns NORMAL when expiry is beyond warning threshold (> 45 days)', () => {
    expect(
      computeVehicleStatus({
        expiryDateIso: '2027-01-11', // 46 days ahead
        todayIso,
        warningDays: 45,
      })
    ).toBe('NORMAL');
  });

  it('returns WARNING on exact boundary (45 days) and day 0 (today)', () => {
    expect(
      computeVehicleStatus({
        expiryDateIso: '2027-01-10', // exactly 45 days
        todayIso,
        warningDays: 45,
      })
    ).toBe('WARNING');

    expect(
      computeVehicleStatus({
        expiryDateIso: '2026-11-26', // day 0
        todayIso,
        warningDays: 45,
      })
    ).toBe('WARNING');
  });

  it('returns EXPIRED when expiry is 1 day in the past', () => {
    expect(
      computeVehicleStatus({
        expiryDateIso: '2026-11-25',
        todayIso,
        warningDays: 45,
      })
    ).toBe('EXPIRED');
  });

  it('preserves maintenance composite statuses (MAINTENANCE, MAINTENANCE_WARNING, MAINTENANCE_EXPIRED)', () => {
    expect(
      computeVehicleStatus({
        expiryDateIso: '2027-06-01',
        isUnderMaintenance: true,
        todayIso,
        warningDays: 45,
      })
    ).toBe('MAINTENANCE');

    expect(
      computeVehicleStatus({
        expiryDateIso: '2026-12-15',
        isUnderMaintenance: true,
        todayIso,
        warningDays: 45,
      })
    ).toBe('MAINTENANCE_WARNING');

    expect(
      computeVehicleStatus({
        expiryDateIso: '2026-10-01',
        isUnderMaintenance: true,
        todayIso,
        warningDays: 45,
      })
    ).toBe('MAINTENANCE_EXPIRED');
  });

  it('never overrides terminal statuses DISPOSED or DECOMMISSIONED even if expired', () => {
    expect(
      computeVehicleStatus({
        expiryDateIso: '2020-01-01',
        currentStatus: 'DISPOSED',
        todayIso,
      })
    ).toBe('DISPOSED');

    expect(
      computeVehicleStatus({
        expiryDateIso: '2020-01-01',
        currentStatus: 'DECOMMISSIONED',
        todayIso,
      })
    ).toBe('DECOMMISSIONED');
  });

  it('handles missing or malformed expiry dates gracefully without throwing', () => {
    expect(computeVehicleStatus({ expiryDateIso: '', todayIso })).toBe('NORMAL');
    expect(computeVehicleStatus({ expiryDateIso: null, isUnderMaintenance: true, todayIso })).toBe('MAINTENANCE');
    expect(computeVehicleStatus({ expiryDateIso: 'invalid-date', todayIso })).toBe('NORMAL');
  });
});
