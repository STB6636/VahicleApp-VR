import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import {
  formatCaretakerName,
  formatCaretakerPositionLevel,
  formatCaretakerFullLabel,
} from '@/lib/caretakerFormatter';
import { parseAppSettings } from '@/hooks/useAppSettings';
import { isValidGasExecUrl } from '@/services/driveBridgeService';
import { filterCaretakerCandidates } from '@/components/common/SmartCaretakerCombobox';
import { buildVehicleNotifications } from '@/components/common/NotificationBell';
import { PortalOnlyGuard } from '@/components/auth/PortalOnlyGuard';
import { SsoCallbackPage } from '@/pages/SsoCallbackPage';
import { PortalAccessBlockedPage } from '@/pages/PortalAccessBlockedPage';
import { SettingsPage } from '@/pages/SettingsPage';
import {
  useAuthStore,
  getVehicleRoleLabel,
  getAdminScopeSummary,
} from '@/stores/useAuthStore';
import * as ssoAuthService from '@/services/ssoAuthService';
import { vehicleService } from '@/services/vehicleService';
import { portalDirectoryService } from '@/services/portalDirectoryService';
import type { PortalPersonnelDirectoryRow, VehicleEnrichedRow } from '@/types/vehicle.types';

async function flushPromises(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('v2.0 Improvements — Formatter, Zero-Hardcode, GAS URL, Notifications & 3-Role RBAC', () => {
  it('formats caretaker name and [position + level] cleanly without meaningless level tokens', () => {
    expect(
      formatCaretakerName({
        prefix_name: 'นาย',
        first_name: 'สมชาย',
        last_name: 'ใจดี',
      })
    ).toBe('นายสมชาย ใจดี');

    expect(
      formatCaretakerPositionLevel({
        position_name: 'พนักงานขับรถยนต์',
        position_level_name: 'ทักษะพิเศษ',
      })
    ).toBe('พนักงานขับรถยนต์ ทักษะพิเศษ');

    expect(
      formatCaretakerPositionLevel({
        position_name: 'พนักงานขับรถยนต์',
        position_level_name: 'ไม่มีระดับ',
      })
    ).toBe('พนักงานขับรถยนต์');

    expect(
      formatCaretakerFullLabel({
        full_name: 'นายสมชาย ใจดี',
        position_name: 'เจ้าพนักงานเทศกิจ',
        position_level_name: 'ชำนาญงาน',
      })
    ).toBe('นายสมชาย ใจดี, เจ้าพนักงานเทศกิจ ชำนาญงาน');
  });

  it('excludes inactive personnel (allows_account_provision=false) and filters by Lv3 department', () => {
    const list: PortalPersonnelDirectoryRow[] = [
      {
        id: 'p1',
        full_name: 'นายขับ รถหนึ่ง',
        department_id: 'dept-1',
        office_id: 'off-1',
        position_name: 'พนักงานขับรถยนต์',
        allows_account_provision: true,
      },
      {
        id: 'p2',
        full_name: 'นายลาออก แล้ว',
        department_id: 'dept-1',
        office_id: 'off-1',
        position_name: 'พนักงานขับรถยนต์',
        allows_account_provision: false,
      },
      {
        id: 'p3',
        full_name: 'นางสาวธุรการ ฝ่ายหนึ่ง',
        department_id: 'dept-1',
        office_id: 'off-1',
        position_name: 'เจ้าพนักงานธุรการ',
        allows_account_provision: true,
      },
    ];

    const normal = filterCaretakerCandidates({
      personnel: list,
      departmentId: 'dept-1',
      defaultPosition: 'พนักงานขับรถยนต์',
      showAllInOrg: false,
    });
    expect(normal.map((p) => p.id)).toEqual(['p1']);

    const unlocked = filterCaretakerCandidates({
      personnel: list,
      departmentId: 'dept-1',
      defaultPosition: 'พนักงานขับรถยนต์',
      showAllInOrg: true,
    });
    expect(unlocked.map((p) => p.id)).toEqual(['p1', 'p3']);
  });

  it('validates strict Google Apps Script /exec URLs and parses zero-hardcode app_settings', () => {
    expect(isValidGasExecUrl('https://script.google.com/macros/s/AKfycbx12345/exec')).toBe(true);
    expect(isValidGasExecUrl('https://script.google.com/macros/s/AKfycbx12345/dev')).toBe(false);
    expect(isValidGasExecUrl('https://evil.example.com/exec')).toBe(false);

    const parsed = parseAppSettings([
      { key: 'warning_days_before', value: '60', description: '', setting_group: 'general', updated_at: '' },
      { key: 'max_file_mb', value: '99', description: '', setting_group: 'general', updated_at: '' },
      { key: 'default_province', value: 'นนทบุรี', description: '', setting_group: 'general', updated_at: '' },
      { key: 'dashboard_tracking_limit', value: '25', description: '', setting_group: 'general', updated_at: '' },
      { key: 'activities_page_size', value: '20', description: '', setting_group: 'general', updated_at: '' },
      { key: 'notify_maintenance_status', value: 'false', description: '', setting_group: 'general', updated_at: '' },
      { key: 'report_header_sub', value: 'สำนักงานตรวจและบังคับการ', description: '', setting_group: 'report', updated_at: '' },
    ]);

    expect(parsed.warningDaysBefore).toBe(60);
    expect(parsed.maxFileMb).toBe(15); // clamped to GAS Drive Bridge ceiling
    expect(parsed.defaultProvince).toBe('นนทบุรี');
    expect(parsed.dashboardTrackingLimit).toBe(25);
    expect(parsed.activitiesPageSize).toBe(20);
    expect(parsed.notifyMaintenanceStatus).toBe(false);
    expect(parsed.reportHeaderSub).toBe('สำนักงานตรวจและบังคับการ');
  });

  it('toggles MAINTENANCE notifications in buildVehicleNotifications based on notify_maintenance_status', () => {
    const maintVehicle = {
      id: 'v-m1',
      vehicle_code: 'VH0001',
      status_code: 'MAINTENANCE',
      computed_status_code: 'MAINTENANCE',
      current_expiry_date: '2027-06-01',
      vehicle_label: 'กท 1001',
      vehicle_type_name: 'รถยนต์',
    } as VehicleEnrichedRow;

    expect(buildVehicleNotifications([maintVehicle], new Set(), { includeMaintenance: false })).toHaveLength(0);
    expect(buildVehicleNotifications([maintVehicle], new Set(), { includeMaintenance: true })).toHaveLength(1);
  });

  it('produces clean 3-role labels and admin scope summaries for SuperAdmin, Admin Lv2/Lv3, and User', () => {
    expect(getVehicleRoleLabel({ id: '1', role: 'SUPERADMIN' }, null)).toBe('SuperAdmin');
    expect(
      getVehicleRoleLabel(
        { id: '2', role: 'ADMIN', admin_scope: { scope_level_no: 2, org_unit_id: 'off-1', org_unit_name: 'สำนักงานตรวจฯ' } },
        { role_code: 'ADMIN', role_name_th: 'Admin', hierarchy_level: 50 }
      )
    ).toBe('Admin (สำนักงาน/กอง)');
    expect(
      getAdminScopeSummary(
        { id: '3', role: 'ADMIN', admin_scope: { scope_level_no: 3, org_unit_id: 'dept-1', org_unit_name: 'ฝ่ายบริหารงานทั่วไป' } },
        { role_code: 'ADMIN', role_name_th: 'Admin', hierarchy_level: 50 }
      )
    ).toEqual({
      levelLabel: 'มุมมองส่วน/ฝ่าย (Lv3)',
      orgName: 'ฝ่ายบริหารงานทั่วไป',
      isUnassignedAdmin: false,
    });
    expect(getAdminScopeSummary({ id: '4', role: 'ADMIN', admin_scope: null }, null).isUnassignedAdmin).toBe(true);
  });
});

describe('v2.0 UI Flows — USER Role Block (Req 4.1) & 5-Tab SettingsPage', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
    useAuthStore.setState({
      hydrated: false,
      ssoVerified: false,
      user: null,
      personnel: null,
      appPermission: null,
      blockReason: null,
      blockMessage: null,
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  function cleanup() {
    act(() => root.unmount());
    container.remove();
  }

  it('blocks USER role at PortalOnlyGuard and displays USER_ROLE_NOT_SUPPORTED on SsoCallbackPage', async () => {
    // 1. Direct guard check for hydrated USER session
    useAuthStore.getState().setSession({
      user: { id: 'u-regular', username: 'user1', role: 'USER' },
      personnel: { id: 'p-1', full_name: 'นายผู้ใช้ ทั่วไป' },
      appPermission: { role_code: 'USER', role_name_th: 'ผู้ใช้งานทั่วไป', hierarchy_level: 10 },
    });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            <Route path="/portal-required" element={<PortalAccessBlockedPage />} />
            <Route
              path="/dashboard"
              element={
                <PortalOnlyGuard>
                  <div>PROTECTED_ADMIN_DASHBOARD</div>
                </PortalOnlyGuard>
              }
            />
          </Routes>
        </MemoryRouter>
      );
    });
    await flushPromises();
    expect(container.textContent).not.toContain('PROTECTED_ADMIN_DASHBOARD');

    // 2. SSO callback rejection for USER role
    vi.spyOn(ssoAuthService, 'exchangeSsoTokenAndSignIn').mockRejectedValueOnce(
      new ssoAuthService.PortalAuthBlockedError(
        'USER_ROLE_NOT_SUPPORTED',
        ssoAuthService.USER_ROLE_CLOSED_MESSAGE
      )
    );

    await act(async () => {
      root.render(
        <MemoryRouter key="sso-user-block" initialEntries={['/sso-callback?sso_token=USER_TOK']}>
          <Routes>
            <Route path="/sso-callback" element={<SsoCallbackPage />} />
            <Route path="/portal-required" element={<PortalAccessBlockedPage />} />
          </Routes>
        </MemoryRouter>
      );
    });
    await flushPromises();

    expect(useAuthStore.getState().blockReason).toBe('USER_ROLE_NOT_SUPPORTED');
    expect(container.textContent).toContain('ยังไม่เปิดให้สิทธิ์ระดับผู้ใช้งานทั่วไป (User) เข้าใช้งาน');
    cleanup();
  });

  it('renders 5-tab SettingsPage including Google Drive Bridge (/exec) and Vehicle Types CRUD/Reorder tabs', async () => {
    vi.spyOn(vehicleService, 'listSettings').mockResolvedValue([
      { key: 'warning_days_before', value: '45', description: 'วันแจ้งเตือน', setting_group: 'general', updated_at: '' },
      { key: 'gas_drive_bridge_url', value: '', description: 'GAS URL', setting_group: 'storage', updated_at: '' },
      { key: 'activity_folder_id', value: '', description: 'Activity Folder', setting_group: 'storage', updated_at: '' },
      { key: 'vessel_license_folder_id', value: '', description: 'Vessel Folder', setting_group: 'storage', updated_at: '' },
    ]);
    vi.spyOn(vehicleService, 'getSchemaHealth').mockResolvedValue({
      schema: 'vehicleapp',
      healthy: true,
      vehicle_types_count: 4,
      vehicles_count: 0,
      activities_count: 0,
      settings_count: 15,
      checked_at: '2026-11-27T00:00:00Z',
    });
    vi.spyOn(vehicleService, 'listAllVehicleTypes').mockResolvedValue([
      {
        id: 'vt-1',
        code: 'CAR',
        name_th: 'รถยนต์',
        is_vessel: false,
        default_caretaker_position: 'พนักงานขับรถยนต์',
        icon_name: 'fa-car-side',
        sort_order: 1,
        is_active: true,
        is_default: true,
      },
      {
        id: 'vt-2',
        code: 'VESSEL',
        name_th: 'เรือ',
        is_vessel: true,
        default_caretaker_position: 'นายท้ายเรือ',
        icon_name: 'fa-ship',
        sort_order: 2,
        is_active: true,
        is_default: false,
      },
    ]);
    vi.spyOn(portalDirectoryService, 'listPositionNames').mockResolvedValue(['พนักงานขับรถยนต์', 'นายท้ายเรือ']);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      root.render(
        <QueryClientProvider client={qc}>
          <SettingsPage />
        </QueryClientProvider>
      );
    });
    await flushPromises();

    // All 5 tabs visible
    expect(container.textContent).toContain('1. ตั้งค่าทั่วไป & แจ้งเตือน');
    expect(container.textContent).toContain('2. Google Drive Bridge');
    expect(container.textContent).toContain('3. ประเภทยานพาหนะ (Dropdown)');
    expect(container.textContent).toContain('4. สุขภาพฐานข้อมูล & Cron');
    expect(container.textContent).toContain('5. บันทึกการใช้งาน (Audit Logs)');

    // Switch to Google Drive Bridge tab -> shows /exec field & test button
    const driveTabBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Google Drive Bridge')
    );
    expect(driveTabBtn).toBeTruthy();
    await act(async () => {
      driveTabBtn!.click();
    });
    await flushPromises();
    expect(container.textContent).toContain('ลิงก์ Google Apps Script Web App (ลงท้ายด้วย /exec)');
    expect(container.textContent).toContain('ตรวจสอบการเชื่อมต่อ');

    // Switch to Vehicle Types tab -> shows CRUD & reorder buttons
    const typesTabBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('ประเภทยานพาหนะ')
    );
    expect(typesTabBtn).toBeTruthy();
    await act(async () => {
      typesTabBtn!.click();
    });
    await flushPromises();
    expect(container.textContent).toContain('รถยนต์');
    expect(container.textContent).toContain('เรือ');
    expect(container.textContent).toContain('เพิ่มหลายรายการ');
    expect(container.querySelector('button[aria-label="เลื่อน เรือ ขึ้น"]')).toBeTruthy();

    cleanup();
  });
});
