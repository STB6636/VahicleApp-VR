import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ExcelJS from 'exceljs';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { normalizePortalOrgUnits, portalDirectoryService } from '@/services/portalDirectoryService';
import { buildVehicleReportWorkbookBuffer } from '@/lib/excelExport';
import { escapeHtml } from '@/lib/htmlUtils';
import { QUERY_KEYS } from '@/lib/queryClient';
import { VehicleFormModal } from '@/components/vehicles/VehicleFormModal';
import { ActivityRecordModal } from '@/components/activities/ActivityRecordModal';
import { SmartCaretakerCombobox } from '@/components/common/SmartCaretakerCombobox';
import { SettingsPage } from '@/pages/SettingsPage';
import { vehicleService } from '@/services/vehicleService';
import { driveBridgeService } from '@/services/driveBridgeService';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUiStore } from '@/stores/useUiStore';
import Swal from 'sweetalert2';
import type {
  PortalOrgUnitRow,
  PortalPersonnelDirectoryRow,
  VehicleEnrichedRow,
  VehicleTypeRow,
} from '@/types/vehicle.types';
import {
  normalizeLegacyTimestamp,
  normalizeOrgUnitsWithLevels,
  transformLegacyVehicleRow,
} from '../../scripts/lib/legacyParser.mjs';

async function flushPromises(ms = 30): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

const VEHICLE_TYPES: VehicleTypeRow[] = [
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

const ORG_UNITS: PortalOrgUnitRow[] = [
  { id: 'bur-1', level_id: 'lvl-1', parent_id: null, level_no: 1, name_th: 'สำนักเทศกิจ' },
  { id: 'off-1', level_id: 'lvl-2', parent_id: 'bur-1', level_no: 2, name_th: 'สำนักงานตรวจและบังคับการ' },
  { id: 'off-2', level_id: 'lvl-2', parent_id: 'bur-1', level_no: 2, name_th: 'สำนักงานอำนวยการ' },
  { id: 'dept-1', level_id: 'lvl-3', parent_id: 'off-1', level_no: 3, name_th: 'ส่วนตรวจและบังคับการ 1' },
  { id: 'dept-2', level_id: 'lvl-3', parent_id: 'off-2', level_no: 3, name_th: 'ฝ่ายบริหารงานทั่วไป' },
  { id: 'div-1', level_id: 'lvl-4', parent_id: 'dept-1', level_no: 4, name_th: 'กลุ่มงานสายตรวจ 1' },
];

function makeVehicle(overrides: Partial<VehicleEnrichedRow> = {}): VehicleEnrichedRow {
  return {
    id: overrides.id ?? 'v-1',
    vehicle_code: overrides.vehicle_code ?? 'VH0001',
    vehicle_type_id: overrides.vehicle_type_id ?? 'vt-car',
    vehicle_type_code: overrides.vehicle_type_code ?? 'CAR',
    vehicle_type_name: overrides.vehicle_type_name ?? 'รถยนต์',
    is_vessel: overrides.is_vessel ?? false,
    vehicle_type_icon: overrides.is_vessel ? 'fa-ship' : 'fa-car-side',
    license_plate: overrides.is_vessel ? null : (overrides.license_plate ?? '1กข 1234'),
    province: overrides.is_vessel ? null : (overrides.province ?? 'กรุงเทพมหานคร'),
    vessel_name: overrides.is_vessel ? (overrides.vessel_name ?? 'เรือเทศกิจ 1') : null,
    vessel_license_no: overrides.is_vessel ? (overrides.vessel_license_no ?? 'กท.101/2569') : null,
    vehicle_label: overrides.vehicle_label ?? '1กข 1234 กรุงเทพมหานคร',
    brand: 'Toyota',
    model: 'Hilux',
    model_year: 2566,
    engine_cc: 2400,
    price: 850000,
    acquisition_date: '2023-05-01',
    disposal_date: overrides.disposal_date ?? null,
    current_expiry_date: overrides.current_expiry_date ?? '2026-11-01',
    days_until_expiry: overrides.days_until_expiry ?? -5,
    office_id: overrides.office_id ?? 'off-1',
    office_name: overrides.office_name ?? 'สำนักงานตรวจและบังคับการ',
    department_id: overrides.department_id ?? 'dept-1',
    department_name: overrides.department_name ?? 'ส่วนตรวจและบังคับการ 1',
    division_id: overrides.division_id ?? 'div-1',
    division_name: overrides.division_name ?? 'กลุ่มงานสายตรวจ 1',
    caretaker_personnel_id: overrides.caretaker_personnel_id ?? null,
    caretaker_name: overrides.caretaker_name ?? null,
    caretaker_position_display: null,
    caretaker_position: null,
    caretaker_level: null,
    status_code: overrides.status_code ?? 'EXPIRED',
    computed_status_code: overrides.computed_status_code ?? overrides.status_code ?? 'EXPIRED',
    is_under_maintenance: overrides.is_under_maintenance ?? false,
    attachment_folder_id: overrides.attachment_folder_id ?? null,
    latest_file_url: overrides.latest_file_url ?? null,
    remarks: overrides.remarks ?? null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

describe('Regression Suite: Portal Org Normalization, Excel Binary, HTML Escape & Migration', () => {
  it('resolves level_no from Portal SSO /portal-api/org-units { levels, data } using level_id', () => {
    const normalized = normalizePortalOrgUnits({
      success: true,
      levels: [
        { id: 'lvl-1', level_no: 1, code: 'BUREAU', name_th: 'สำนัก' },
        { id: 'lvl-2', level_no: 2, code: 'OFFICE', name_th: 'สำนักงาน' },
        { id: 'lvl-3', level_no: 3, code: 'DEPT', name_th: 'ส่วน/ฝ่าย' },
        { id: 'lvl-4', level_no: 4, code: 'DIV', name_th: 'กลุ่มงาน' },
      ],
      data: [
        { id: 'bur-1', level_id: 'lvl-1', parent_id: null, name_th: 'สำนักเทศกิจ' },
        { id: 'off-1', level_id: 'lvl-2', parent_id: 'bur-1', name_th: 'สำนักงานตรวจและบังคับการ' },
        { id: 'dept-1', level_id: 'lvl-3', parent_id: 'off-1', name_th: 'ส่วนตรวจ 1' },
        { id: 'div-1', level_id: 'lvl-4', parent_id: 'dept-1', name_th: 'กลุ่มงาน 1' },
      ],
    });

    expect(normalized.map((u) => [u.id, u.level_no])).toEqual([
      ['bur-1', 1],
      ['off-1', 2],
      ['dept-1', 3],
      ['div-1', 4],
    ]);
  });

  it('generates a real readable .xlsx workbook with 3 sheets, 9-status summary, and Thai BE dates', async () => {
    const car = makeVehicle({
      id: 'c1',
      vehicle_code: 'VH0001',
      license_plate: '1กข 1234',
      status_code: 'EXPIRED',
      current_expiry_date: '2026-09-30',
    });
    const vessel = makeVehicle({
      id: 'v1',
      vehicle_code: 'VH0002',
      vehicle_type_id: 'vt-vessel',
      vehicle_type_code: 'VESSEL',
      vehicle_type_name: 'เรือ',
      is_vessel: true,
      vessel_name: 'เรือเทศกิจ 1',
      vessel_license_no: 'กท.101/2569',
      vehicle_label: 'เรือเทศกิจ 1 | กท.101/2569',
      status_code: 'WARNING',
      current_expiry_date: '2026-12-15',
    });

    const { fileName, buffer } = await buildVehicleReportWorkbookBuffer({
      cars: [car],
      vessels: [vessel],
      departmentLabel: 'สรุปทุกส่วนราชการ',
      reporterName: 'นายทดสอบ ระบบ',
      reporterPosition: 'นักจัดการงานทั่วไป',
    });

    expect(fileName).toMatch(/^รายงานยานพาหนะ_\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(buffer.byteLength).toBeGreaterThan(1000);

    // Parse the real binary workbook back with ExcelJS to prove binary integrity
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);

    expect(wb.worksheets.map((ws) => ws.name)).toEqual(['สรุปภาพรวม', 'รถราชการ', 'เรือราชการ']);

    const wsSummary = wb.getWorksheet('สรุปภาพรวม')!;
    expect(wsSummary.getCell('A1').value).toBe('รายงานสถานะการต่อภาษีและใบอนุญาตยานพาหนะราชการ');
    // Row 6 = ยานพาหนะทั้งหมด (2)
    expect(wsSummary.getRow(6).getCell(1).value).toBe('ยานพาหนะทั้งหมด');
    expect(wsSummary.getRow(6).getCell(2).value).toBe(2);

    const wsCars = wb.getWorksheet('รถราชการ')!;
    expect(wsCars.getRow(2).getCell(5).value).toBe('1กข 1234');
    expect(wsCars.getRow(2).getCell(9).value).toBe('30/09/2569');
    expect(wsCars.getRow(2).getCell(10).value).toBe('ขาดต่ออายุ');

    const wsVessels = wb.getWorksheet('เรือราชการ')!;
    expect(wsVessels.getRow(2).getCell(4).value).toBe('เรือเทศกิจ 1');
    expect(wsVessels.getRow(2).getCell(7).value).toBe('15/12/2569');
  });

  it('escapes HTML payloads safely for SweetAlert2 dialogs', () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe(
      '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'
    );
    expect(escapeHtml("O'Reilly & Co")).toBe('O&#39;Reilly &amp; Co');
  });

  it('joins org_unit_levels by level_id, preserves Recorded_At time, and guards smallint Model_Year', () => {
    const joined = normalizeOrgUnitsWithLevels(
      [
        { id: 'off-1', parent_id: null, level_id: 'lvl-2', name_th: 'สำนักงานตรวจและบังคับการ' },
        { id: 'dept-1', parent_id: 'off-1', level_id: 'lvl-3', name_th: 'ส่วนตรวจ 1' },
      ],
      [
        { id: 'lvl-2', level_no: 2 },
        { id: 'lvl-3', level_no: 3 },
      ]
    );
    expect(joined[1].level_no).toBe(3);

    expect(normalizeLegacyTimestamp('2026-11-15 14:35:20')).toBe('2026-11-15T14:35:20+07:00');
    expect(normalizeLegacyTimestamp('15/11/2569 09:05')).toBe('2026-11-15T09:05:00+07:00');

    const res = transformLegacyVehicleRow(
      {
        Vehicle_ID: 'VH0099',
        Vehicle_Type: 'รถยนต์',
        License_Plate: '2กข 5555',
        Current_Expiry_Date: '30/09/2569',
        Division: 'ส่วนตรวจ 1',
        Model_Year: '999999',
        Status: 'ปกติ',
      },
      {
        vehicleTypesByCode: new Map([['CAR', { id: 'vt-car', code: 'CAR' }]]),
        orgUnits: joined,
        personnelDirectory: [],
      }
    );
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.error);
    expect(res.record.office_id).toBe('off-1');
    expect(res.record.department_id).toBe('dept-1');
    expect(res.record.model_year).toBeNull();
    expect(res.warnings.some((w) => w.includes('Model_Year'))).toBe(true);
  });
});

describe('Regression Suite: Interactive Modals, Async Org Selects, Terminal Lock & Stacked Esc', () => {
  let container: HTMLDivElement;
  let root: Root;
  let qc: QueryClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    document.body.classList.remove('bma-modal-open');
    vi.spyOn(vehicleService, 'listSettings').mockResolvedValue([
      {
        key: 'warning_days_before',
        value: '45',
        description: 'วันแจ้งเตือน',
        setting_group: 'general',
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        key: 'gas_drive_bridge_url',
        value: 'https://script.google.com/macros/s/test/exec',
        description: 'Bridge URL',
        setting_group: 'storage',
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        key: 'activity_folder_id',
        value: '1ActivityRootFolderId999',
        description: 'Activity Folder',
        setting_group: 'storage',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);
    vi.spyOn(portalDirectoryService, 'listPersonnel').mockResolvedValue([]);

    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  function cleanup() {
    act(() => root.unmount());
    container.remove();
  }

  it('preserves office_id/department_id/division_id when orgUnits loads asynchronously in VehicleFormModal & locks DISPOSED for FLEET_ADMIN', async () => {
    let resolveOrgs!: (rows: PortalOrgUnitRow[]) => void;
    vi.spyOn(portalDirectoryService, 'listOrgUnits').mockImplementation(
      () => new Promise<PortalOrgUnitRow[]>((resolve) => {
        resolveOrgs = resolve;
      })
    );

    useAuthStore.getState().setSession({
      user: { id: 'u-fleet', username: 'fleet1', role: 'USER' },
      personnel: {
        id: 'p-fleet',
        full_name: 'นายดูแล ฝ่าย1',
        office_id: 'off-1',
        department_id: 'dept-1',
      },
      appPermission: { role_code: 'FLEET_ADMIN', role_name_th: 'ผู้ดูแลประจำหน่วยงาน', hierarchy_level: 50 },
    });

    const disposedVehicle = makeVehicle({
      id: 'v-disp',
      status_code: 'DISPOSED',
      disposal_date: '2026-05-01',
      office_id: 'off-1',
      department_id: 'dept-1',
      division_id: 'div-1',
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={qc}>
          <VehicleFormModal
            open
            onClose={() => {}}
            editingVehicle={disposedVehicle}
            vehicleTypes={VEHICLE_TYPES}
            existingProvinces={['กรุงเทพมหานคร']}
          />
        </QueryClientProvider>
      );
    });
    await flushPromises();

    // Now resolve orgUnits asynchronously (simulating real Portal API latency)
    await act(async () => {
      resolveOrgs(ORG_UNITS);
    });
    await flushPromises();

    const officeSelect = document.querySelector<HTMLSelectElement>('select[aria-label="สำนักงาน (Lv2)"]');
    const deptSelect = document.querySelector<HTMLSelectElement>('select[aria-label="ฝ่าย / ส่วน (Lv3)"]');
    const divSelect = document.querySelector<HTMLSelectElement>('select[aria-label="กลุ่มงาน (Lv4 - ถ้ามี)"]');
    const statusSelect = document.querySelector<HTMLSelectElement>('select[aria-label="สถานะยานพาหนะ"]');

    expect(officeSelect?.value).toBe('off-1');
    expect(deptSelect?.value).toBe('dept-1');
    expect(divSelect?.value).toBe('div-1');

    // FLEET_ADMIN should only see scoped org (off-1 / dept-1), not off-2 / dept-2
    expect(Array.from(officeSelect?.options ?? []).map((o) => o.value)).not.toContain('off-2');
    expect(Array.from(deptSelect?.options ?? []).map((o) => o.value)).not.toContain('dept-2');

    // Terminal DISPOSED status MUST be locked for non-SUPERADMIN
    expect(statusSelect?.disabled).toBe(true);
    expect(Array.from(statusSelect?.options ?? []).map((o) => o.value)).toEqual(['DISPOSED']);
    cleanup();
  });

  it('blocks preselected DISPOSED vehicle for non-superadmin, keeps modal open on stacked Picker Esc, and preserves inputs on vehicles refetch', async () => {
    useAuthStore.getState().setSession({
      user: { id: 'u-officer', username: 'officer1', role: 'USER' },
      personnel: null,
      appPermission: { role_code: 'DEPT_OFFICER', role_name_th: 'เจ้าหน้าที่', hierarchy_level: 10 },
    });

    const onClose = vi.fn();
    const disposed = makeVehicle({ id: 'v-disp', status_code: 'DISPOSED', vehicle_label: 'กท 9999' });
    const expired = makeVehicle({ id: 'v-exp', status_code: 'EXPIRED', vehicle_label: 'กท 1111' });

    // 1. Preselected DISPOSED for non-superadmin -> shows error and does NOT select v-disp
    await act(async () => {
      root.render(
        <QueryClientProvider client={qc}>
          <ActivityRecordModal
            open
            onClose={onClose}
            vehicles={[disposed, expired]}
            vehicleTypes={VEHICLE_TYPES}
            preselectedVehicleId="v-disp"
          />
        </QueryClientProvider>
      );
    });
    await flushPromises();
    expect(document.body.textContent).toContain('เฉพาะผู้ดูแลระบบสูงสุด');

    // 2. Open stacked VehiclePickerModal and press Escape -> ONLY Picker closes, ActivityRecordModal stays open!
    const searchBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('ค้นหา')
    );
    expect(searchBtn).toBeTruthy();
    await act(async () => {
      searchBtn!.click();
    });
    await flushPromises();
    expect(document.querySelectorAll('[role="dialog"]').length).toBe(2);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await flushPromises();

    expect(onClose).not.toHaveBeenCalled();
    expect(document.querySelectorAll('[role="dialog"]').length).toBe(1);
    expect(document.body.classList.contains('bma-modal-open')).toBe(true);

    // 3. Typing into documentNo and receiving a new `vehicles` array reference must NOT wipe typed input
    const docInput = document.querySelector<HTMLInputElement>('input[type="text"]');
    expect(docInput).toBeTruthy();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(docInput!, 'DOC-2569-01');
      docInput!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(docInput!.value).toBe('DOC-2569-01');

    await act(async () => {
      root.render(
        <QueryClientProvider client={qc}>
          <ActivityRecordModal
            open
            onClose={onClose}
            vehicles={[{ ...disposed }, { ...expired }]}
            vehicleTypes={VEHICLE_TYPES}
            preselectedVehicleId="v-disp"
          />
        </QueryClientProvider>
      );
    });
    await flushPromises();
    expect(docInput!.value).toBe('DOC-2569-01');

    cleanup();
  });

  it('uploads vessel activity proof with existingFolderId=null (into activity_folder_id) and invalidates all activity queries', async () => {
    useAuthStore.getState().setSession({
      user: { id: 'u-sa', username: 'sa', role: 'SUPERADMIN' },
      personnel: null,
      appPermission: { role_code: 'APP_ADMIN', role_name_th: 'ผู้ดูแลสูงสุด', hierarchy_level: 90 },
    });

    const uploadSpy = vi.spyOn(driveBridgeService, 'uploadFile').mockResolvedValue({
      url: 'https://drive.google.com/file/d/uploaded123/view',
      folderId: '1ActivitySubfolder',
      fileName: 'proof.pdf',
    });
    const recordSpy = vi.spyOn(vehicleService, 'recordActivity').mockResolvedValue({
      success: true,
      updated_count: 1,
      message: 'บันทึกรายการสำเร็จ 1 รายการ',
    });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const vessel = makeVehicle({
      id: 'v-ship',
      vehicle_code: 'VH0008',
      vehicle_type_id: 'vt-vessel',
      vehicle_type_code: 'VESSEL',
      vehicle_type_name: 'เรือ',
      is_vessel: true,
      vessel_name: 'เรือตรวจ 8',
      vessel_license_no: 'กท.8/2568',
      vehicle_label: 'เรือตรวจ 8 | กท.8/2568',
      status_code: 'WARNING',
      attachment_folder_id: '1VesselLicenseFolderDoNotUseForActivity',
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={qc}>
          <ActivityRecordModal
            open
            onClose={() => {}}
            vehicles={[vessel]}
            vehicleTypes={VEHICLE_TYPES}
            preselectedVehicleId="v-ship"
          />
        </QueryClientProvider>
      );
    });
    await flushPromises();

    // Fill documentNo, expiryDate, and attach PDF file
    const textInputs = document.querySelectorAll<HTMLInputElement>('input[type="text"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(textInputs[0], 'กท.8/2570');
      textInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
    });
    // expiryDate ThaiDatePicker input is the 3rd text input (documentNo, startDate, expiryDate)
    const expiryInput = Array.from(textInputs).find((el) =>
      el.placeholder.includes('30/09/2570')
    );
    expect(expiryInput).toBeTruthy();
    await act(async () => {
      setter.call(expiryInput!, '30/09/2570');
      expiryInput!.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).toBeTruthy();
    const pdf = new File(['%PDF-1.4'], 'license.pdf', { type: 'application/pdf' });
    await act(async () => {
      Object.defineProperty(fileInput!, 'files', { value: [pdf], configurable: true });
      fileInput!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const form = document.getElementById('activity-record-form') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await flushPromises();

    expect(uploadSpy).toHaveBeenCalledTimes(1);
    expect(uploadSpy.mock.calls[0][0].existingFolderId).toBeNull();
    expect(uploadSpy.mock.calls[0][0].folderIdOrUrl).toBe('1ActivityRootFolderId999');
    expect(recordSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: QUERY_KEYS.activitiesAll });

    cleanup();
  });

  it('preserves fallbackLabel on blur and shows full candidates on focus in SmartCaretakerCombobox', async () => {
    const people: PortalPersonnelDirectoryRow[] = [
      {
        id: 'p-1',
        full_name: 'นายสมชาย ขับดี',
        position_name: 'พนักงานขับรถยนต์',
        office_id: 'off-1',
        department_id: 'dept-1',
      },
    ];
    const onChange = vi.fn();

    await act(async () => {
      root.render(
        <SmartCaretakerCombobox
          personnel={people}
          value="p-transferred-out"
          onChange={onChange}
          officeId="off-1"
          departmentId="dept-1"
          defaultPosition="พนักงานขับรถยนต์"
          showAllInOrg={false}
          onToggleShowAll={() => {}}
          fallbackLabel="นายเดิม ย้ายไปแล้ว"
        />
      );
    });
    await flushPromises();

    const input = container.querySelector<HTMLInputElement>('input[role="combobox"]')!;
    expect(input.value).toBe('นายเดิม ย้ายไปแล้ว');

    // Focusing shows candidate list instead of filtering by fallbackLabel
    await act(async () => {
      input.focus();
    });
    expect(container.textContent).toContain('นายสมชาย ขับดี');

    // Typing then clicking outside restores fallbackLabel without clearing value
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(input, 'xyz');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(input.value).toBe('นายเดิม ย้ายไปแล้ว');
    expect(onChange).not.toHaveBeenCalled();

    cleanup();
  });

  it('enforces GAS Drive Bridge 1-15 MB ceiling for max_file_mb in SettingsPage', async () => {
    useUiStore.setState({ toasts: [] });
    vi.spyOn(vehicleService, 'listSettings').mockResolvedValue([
      {
        key: 'warning_days_before',
        value: '45',
        description: 'วันแจ้งเตือนล่วงหน้า',
        setting_group: 'general',
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        key: 'max_file_mb',
        value: '10',
        description: 'ขนาดไฟล์แนบสูงสุด (MB)',
        setting_group: 'general',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);
    vi.spyOn(vehicleService, 'getSchemaHealth').mockResolvedValue({
      schema: 'vehicleapp',
      healthy: true,
      vehicle_types_count: 4,
      vehicles_count: 0,
      activities_count: 0,
      settings_count: 2,
      checked_at: '2026-01-01T00:00:00Z',
    });
    const updateSpy = vi.spyOn(vehicleService, 'updateSettings').mockResolvedValue(undefined);
    const swalSpy = vi.spyOn(Swal, 'fire').mockResolvedValue({
      isConfirmed: true,
      isDenied: false,
      isDismissed: false,
    } as never);

    await act(async () => {
      root.render(
        <QueryClientProvider client={qc}>
          <SettingsPage />
        </QueryClientProvider>
      );
    });
    await flushPromises();

    const maxFileInput = container.querySelector<HTMLInputElement>('#setting-max_file_mb')!;
    const form = container.querySelector<HTMLFormElement>('form')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;

    expect(maxFileInput).toBeTruthy();
    expect(maxFileInput.min).toBe('1');
    expect(maxFileInput.max).toBe('15');

    // 1. Value 16 (> 15 MB GAS ceiling) must be rejected with error toast and NOT save
    await act(async () => {
      setter.call(maxFileInput, '16');
      maxFileInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await flushPromises();

    expect(useUiStore.getState().toasts.some((t) => t.variant === 'error' && t.message.includes('1 - 15 MB'))).toBe(true);
    expect(swalSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();

    // 2. Value 0 (< 1 MB) must also be rejected
    useUiStore.setState({ toasts: [] });
    await act(async () => {
      setter.call(maxFileInput, '0');
      maxFileInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await flushPromises();

    expect(useUiStore.getState().toasts.some((t) => t.variant === 'error' && t.message.includes('1 - 15 MB'))).toBe(true);
    expect(swalSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();

    // 3. Value 15 (exact ceiling) must pass validation, prompt Swal, and save
    useUiStore.setState({ toasts: [] });
    await act(async () => {
      setter.call(maxFileInput, '15');
      maxFileInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await flushPromises();

    expect(swalSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy).toHaveBeenCalledWith([{ key: 'max_file_mb', value: '15' }]);

    cleanup();
  });
});
