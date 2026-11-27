import { formatThaiDate, getTodayBeFileTag, getTodayIsoBangkok } from '@/lib/thaiDate';
import { VEHICLE_STATUS_MAP } from '@/lib/vehicleStatus';
import {
  computeNineStatusSummary,
  resolveVehicleOrgLabel,
} from '@/lib/reportUtils';
import type { VehicleEnrichedRow } from '@/types/vehicle.types';

export interface ExcelExportParams {
  cars: VehicleEnrichedRow[];
  vessels: VehicleEnrichedRow[];
  departmentLabel: string;
  reporterName: string;
  reporterPosition?: string;
}

export async function exportVehicleReportToExcel(params: ExcelExportParams): Promise<string> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = params.reporterName || 'Vehicle App';
  wb.created = new Date();

  const all = [...params.cars, ...params.vessels];
  const summary = computeNineStatusSummary(all);
  const reportDateTh = formatThaiDate(getTodayIsoBangkok(), 'long');

  const headerFill = {
    type: 'pattern' as const,
    pattern: 'solid' as const,
    fgColor: { argb: 'FF00744B' },
  };
  const headerFont = { name: 'Sarabun', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  const bodyFont = { name: 'Sarabun', size: 11 };

  // Sheet 1: สรุปภาพรวม 9 สถานะ
  const wsSummary = wb.addWorksheet('สรุปภาพรวม');
  wsSummary.columns = [
    { header: 'รายการสรุปสถานะยานพาหนะ', key: 'label', width: 38 },
    { header: 'จำนวน (คัน/ลำ)', key: 'count', width: 18 },
  ];

  wsSummary.insertRow(1, ['รายงานสถานะการต่อภาษีและใบอนุญาตยานพาหนะราชการ']);
  wsSummary.mergeCells('A1:B1');
  wsSummary.getCell('A1').font = { name: 'Sarabun', size: 14, bold: true, color: { argb: 'FF005B2E' } };
  wsSummary.insertRow(2, [`ส่วนราชการ: ${params.departmentLabel} | วันที่ออกรายงาน: ${reportDateTh}`]);
  wsSummary.mergeCells('A2:B2');
  wsSummary.getCell('A2').font = { name: 'Sarabun', size: 10, color: { argb: 'FF475569' } };
  wsSummary.insertRow(3, [`ผู้จัดทำรายงาน: ${params.reporterName}${params.reporterPosition ? ` (${params.reporterPosition})` : ''}`]);
  wsSummary.mergeCells('A3:B3');
  wsSummary.getCell('A3').font = { name: 'Sarabun', size: 10, color: { argb: 'FF475569' } };
  wsSummary.insertRow(4, []);

  const summaryHeaderRow = wsSummary.getRow(5);
  summaryHeaderRow.eachCell((c) => {
    c.fill = headerFill;
    c.font = headerFont;
    c.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  const summaryRows: Array<[string, number]> = [
    ['ยานพาหนะทั้งหมด', summary.total],
    ['ปกติ', summary.normal],
    ['กำลังจะขาดต่ออายุ', summary.warning],
    ['ซ่อมบำรุง กำลังจะขาดต่ออายุ', summary.maintenance_warning],
    ['ขาดต่ออายุ', summary.expired],
    ['ซ่อมบำรุง ขาดต่ออายุ', summary.maintenance_expired],
    ['ซ่อมบำรุง', summary.maintenance],
    ['ยุบสภาพรอจำหน่าย', summary.decommissioned],
    ['จำหน่าย', summary.disposed],
  ];

  for (const [label, count] of summaryRows) {
    const row = wsSummary.addRow({ label, count });
    row.font = bodyFont;
    row.getCell(2).alignment = { horizontal: 'right' };
  }

  // Sheet 2: รถราชการ
  if (params.cars.length > 0) {
    const wsCars = wb.addWorksheet('รถราชการ');
    wsCars.columns = [
      { header: 'ลำดับ', key: 'no', width: 8 },
      { header: 'รหัส', key: 'code', width: 12 },
      { header: 'ส่วนราชการ', key: 'dept', width: 28 },
      { header: 'ประเภท', key: 'type', width: 18 },
      { header: 'ทะเบียน', key: 'plate', width: 16 },
      { header: 'จังหวัด', key: 'province', width: 18 },
      { header: 'ยี่ห้อ / รุ่น', key: 'brandModel', width: 22 },
      { header: 'ผู้ดูแล', key: 'caretaker', width: 26 },
      { header: 'วันสิ้นอายุภาษี (พ.ศ.)', key: 'expiry', width: 18 },
      { header: 'สถานะ', key: 'status', width: 24 },
    ];
    wsCars.getRow(1).eachCell((c) => {
      c.fill = headerFill;
      c.font = headerFont;
      c.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    const sortedCars = [...params.cars].sort((a, b) => {
      const deptCmp = resolveVehicleOrgLabel(a).localeCompare(resolveVehicleOrgLabel(b), 'th');
      if (deptCmp !== 0) return deptCmp;
      const typeCmp = (a.vehicle_type_name || '').localeCompare(b.vehicle_type_name || '', 'th');
      if (typeCmp !== 0) return typeCmp;
      return String(a.current_expiry_date || '').localeCompare(String(b.current_expiry_date || ''));
    });

    sortedCars.forEach((v, idx) => {
      const st = v.computed_status_code || v.status_code;
      const row = wsCars.addRow({
        no: idx + 1,
        code: v.vehicle_code,
        dept: resolveVehicleOrgLabel(v),
        type: v.vehicle_type_name,
        plate: v.license_plate || '-',
        province: v.province || '-',
        brandModel: [v.brand, v.model].filter(Boolean).join(' ') || '-',
        caretaker: v.caretaker_name || '-',
        expiry: formatThaiDate(v.current_expiry_date, 'numeric') || '-',
        status: VEHICLE_STATUS_MAP[st]?.labelTh ?? st,
      });
      row.font = bodyFont;
    });
  }

  // Sheet 3: เรือราชการ
  if (params.vessels.length > 0) {
    const wsVessels = wb.addWorksheet('เรือราชการ');
    wsVessels.columns = [
      { header: 'ลำดับ', key: 'no', width: 8 },
      { header: 'รหัส', key: 'code', width: 12 },
      { header: 'ส่วนราชการ', key: 'dept', width: 28 },
      { header: 'ชื่อเรือ', key: 'vesselName', width: 26 },
      { header: 'เลขที่ใบอนุญาตเรือ', key: 'licenseNo', width: 22 },
      { header: 'ผู้ดูแล', key: 'caretaker', width: 26 },
      { header: 'วันสิ้นอายุใบอนุญาต (พ.ศ.)', key: 'expiry', width: 20 },
      { header: 'สถานะ', key: 'status', width: 24 },
    ];
    wsVessels.getRow(1).eachCell((c) => {
      c.fill = headerFill;
      c.font = headerFont;
      c.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    const sortedVessels = [...params.vessels].sort((a, b) => {
      const deptCmp = resolveVehicleOrgLabel(a).localeCompare(resolveVehicleOrgLabel(b), 'th');
      if (deptCmp !== 0) return deptCmp;
      return String(a.current_expiry_date || '').localeCompare(String(b.current_expiry_date || ''));
    });

    sortedVessels.forEach((v, idx) => {
      const st = v.computed_status_code || v.status_code;
      const row = wsVessels.addRow({
        no: idx + 1,
        code: v.vehicle_code,
        dept: resolveVehicleOrgLabel(v),
        vesselName: v.vessel_name || '-',
        licenseNo: v.vessel_license_no || '-',
        caretaker: v.caretaker_name || '-',
        expiry: formatThaiDate(v.current_expiry_date, 'numeric') || '-',
        status: VEHICLE_STATUS_MAP[st]?.labelTh ?? st,
      });
      row.font = bodyFont;
    });
  }

  const fileName = `รายงานยานพาหนะ_${getTodayBeFileTag()}.xlsx`;
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return fileName;
}
