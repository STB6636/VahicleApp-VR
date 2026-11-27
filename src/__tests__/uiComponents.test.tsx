import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { ReportsPage } from '@/pages/ReportsPage';
import { ActivityRecordModal } from '@/components/activities/ActivityRecordModal';
import { NotificationBell } from '@/components/common/NotificationBell';
import { vehicleService } from '@/services/vehicleService';
import { useAuthStore } from '@/stores/useAuthStore';
import type { VehicleEnrichedRow, VehicleTypeRow } from '@/types/vehicle.types';

async function flushPromises(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

const SAMPLE_TYPES: VehicleTypeRow[] = [
  {
    id: 'vt-car',
    code: 'CAR',
    name_th: 'รถยนต์',
    is_vessel: false,
    default_caretaker_position: 'พนักงานขับรถยนต์',
    icon_name: 'fa-car-side',
    sort_order: 1,
    is_active: true,
  },
  {
    id: 'vt-vessel',
    code: 'VESSEL',
    name_th: 'เรือ',
    is_vessel: true,
    default_caretaker_position: 'นายท้ายเรือ',
    icon_name: 'fa-ship',
    sort_order: 4,
    is_active: true,
  },
];

const SAMPLE_VEHICLES: VehicleEnrichedRow[] = [
  {
    id: 'v-car-1',
    vehicle_code: 'VH0001',
    vehicle_type_id: 'vt-car',
    vehicle_type_code: 'CAR',
    vehicle_type_name: 'รถยนต์',
    is_vessel: false,
    vehicle_type_icon: 'fa-car-side',
    license_plate: '1กข 1234',
    province: 'กรุงเทพมหานคร',
    vessel_name: null,
    vessel_license_no: null,
    vehicle_label: '1กข 1234 กรุงเทพมหานคร',
    brand: 'Toyota',
    model: 'Hilux',
    model_year: 2566,
    engine_cc: 2400,
    price: 850000,
    acquisition_date: '2023-05-01',
    disposal_date: null,
    current_expiry_date: '2026-11-01',
    days_until_expiry: -10,
    office_id: 'off-1',
    office_name: 'สำนักงานตรวจและบังคับการ',
    department_id: 'dept-1',
    department_name: 'ส่วนตรวจและบังคับการ 1',
    division_id: null,
    division_name: null,
    caretaker_personnel_id: 'p-1',
    caretaker_name: 'นายสมชาย ขับดี',
    caretaker_position_display: 'พนักงานขับรถยนต์',
    caretaker_position: 'พนักงานขับรถยนต์',
    caretaker_level: null,
    status_code: 'EXPIRED',
    computed_status_code: 'EXPIRED',
    is_under_maintenance: false,
    attachment_folder_id: null,
    latest_file_url: null,
    remarks: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'v-vessel-1',
    vehicle_code: 'VH0002',
    vehicle_type_id: 'vt-vessel',
    vehicle_type_code: 'VESSEL',
    vehicle_type_name: 'เรือ',
    is_vessel: true,
    vehicle_type_icon: 'fa-ship',
    license_plate: null,
    province: null,
    vessel_name: 'เรือเทศกิจ 1',
    vessel_license_no: 'กท.101/2569',
    vehicle_label: 'เรือเทศกิจ 1 | กท.101/2569',
    brand: null,
    model: null,
    model_year: null,
    engine_cc: null,
    price: null,
    acquisition_date: null,
    disposal_date: null,
    current_expiry_date: '2026-12-10',
    days_until_expiry: 14,
    office_id: 'off-1',
    office_name: 'สำนักงานตรวจและบังคับการ',
    department_id: 'dept-1',
    department_name: 'ส่วนตรวจและบังคับการ 1',
    division_id: null,
    division_name: null,
    caretaker_personnel_id: 'p-2',
    caretaker_name: 'นายสมศักดิ์ เดินเรือ',
    caretaker_position_display: 'นายท้ายเรือ',
    caretaker_position: 'นายท้ายเรือ',
    caretaker_level: null,
    status_code: 'WARNING',
    computed_status_code: 'WARNING',
    is_under_maintenance: false,
    attachment_folder_id: null,
    latest_file_url: null,
    remarks: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

describe('Phase 2 & 3 UI Components Render & Role Guards', () => {
  let container: HTMLDivElement;
  let root: Root;
  let qc: QueryClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(vehicleService, 'listVehicles').mockResolvedValue(SAMPLE_VEHICLES);
    vi.spyOn(vehicleService, 'listSettings').mockResolvedValue([
      {
        key: 'app_display_name',
        value: 'ระบบต่อภาษีและใบอนุญาตยานพาหนะราชการ',
        description: 'ชื่อแอป',
        setting_group: 'general',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);
    vi.spyOn(vehicleService, 'listNotificationReads').mockResolvedValue([]);

    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  function cleanup() {
    act(() => root.unmount());
    container.remove();
  }

  it('renders ReportsPage with 9-status summary, car group, and vessel group', async () => {
    useAuthStore.getState().setSession({
      user: { id: 'u-1', username: 'admin1', role: 'ADMIN' },
      personnel: { id: 'p-1', full_name: 'นางสาวทดสอบ รายงาน', position_display: 'นักจัดการงานทั่วไป' },
      appPermission: { role_code: 'FLEET_ADMIN', role_name_th: 'ผู้ดูแลยานพาหนะ', hierarchy_level: 50 },
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <ReportsPage />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });
    await flushPromises();

    expect(container.textContent).toContain('รายงานสถานะยานพาหนะราชการ');
    expect(container.textContent).toContain('ส่วนที่ 1: รายงานรถราชการ (1 คัน)');
    expect(container.textContent).toContain('ส่วนที่ 2: รายงานเรือราชการ (1 ลำ)');
    expect(container.textContent).toContain('1กข 1234');
    expect(container.textContent).toContain('เรือเทศกิจ 1');
    cleanup();
  });

  it('renders NotificationBell with unread count of 2 for EXPIRED + WARNING vehicles', async () => {
    useAuthStore.getState().setSession({
      user: { id: 'u-1', username: 'officer1', role: 'USER' },
      personnel: null,
      appPermission: { role_code: 'DEPT_OFFICER', role_name_th: 'เจ้าหน้าที่', hierarchy_level: 10 },
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <NotificationBell />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });
    await flushPromises();

    expect(container.textContent).toContain('2');
    cleanup();
  });

  it('hides RESTORE_NORMAL option for standard USER and shows it for SUPERADMIN in ActivityRecordModal', async () => {
    useAuthStore.getState().setSession({
      user: { id: 'u-user', username: 'officer1', role: 'USER' },
      personnel: null,
      appPermission: { role_code: 'DEPT_OFFICER', role_name_th: 'เจ้าหน้าที่', hierarchy_level: 10 },
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={qc}>
          <ActivityRecordModal
            open
            onClose={() => {}}
            vehicles={SAMPLE_VEHICLES}
            vehicleTypes={SAMPLE_TYPES}
          />
        </QueryClientProvider>
      );
    });
    await flushPromises();

    expect(document.body.textContent).not.toContain('แก้ไขสถานะ (กลับเป็นปกติ)');

    // Elevate to SUPERADMIN and re-render
    await act(async () => {
      useAuthStore.getState().setSession({
        user: { id: 'u-sa', username: 'superadmin', role: 'SUPERADMIN' },
        personnel: null,
        appPermission: { role_code: 'APP_ADMIN', role_name_th: 'ผู้ดูแลสูงสุด', hierarchy_level: 90 },
      });
      root.render(
        <QueryClientProvider client={qc}>
          <ActivityRecordModal
            open
            onClose={() => {}}
            vehicles={SAMPLE_VEHICLES}
            vehicleTypes={SAMPLE_TYPES}
          />
        </QueryClientProvider>
      );
    });
    await flushPromises();

    expect(document.body.textContent).toContain('แก้ไขสถานะ (กลับเป็นปกติ)');
    cleanup();
  });
});
