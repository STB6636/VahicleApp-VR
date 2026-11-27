import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { vehicleService } from '@/services/vehicleService';
import { useAppSettings } from '@/hooks/useAppSettings';
import { QUERY_KEYS } from '@/lib/queryClient';
import { ALL_VEHICLE_STATUS_ORDER, VEHICLE_STATUS_MAP } from '@/lib/vehicleStatus';
import { formatCaretakerPositionLevel, formatVehicleCaretakerPositionLevel } from '@/lib/caretakerFormatter';
import { VehicleStatusBadge } from '@/components/common/VehicleStatusBadge';
import {
  computeNineStatusSummary,
  filterReportVehicles,
  groupCarsForReport,
  groupVesselsForReport,
  resolveVehicleOrgLabel,
  type ReportCategoryFilter,
} from '@/lib/reportUtils';
import { exportVehicleReportToExcel } from '@/lib/excelExport';
import { formatThaiDate, formatThaiDateTime, getTodayIsoBangkok } from '@/lib/thaiDate';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUiStore } from '@/stores/useUiStore';
import type { VehicleStatusCode } from '@/types/vehicle.types';

export function ReportsPage() {
  const user = useAuthStore((s) => s.user);
  const personnel = useAuthStore((s) => s.personnel);
  const showToast = useUiStore((s) => s.showToast);

  const [category, setCategory] = useState<ReportCategoryFilter>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | VehicleStatusCode>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [exportingExcel, setExportingExcel] = useState(false);

  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.vehicles,
    queryFn: vehicleService.listVehicles,
  });

  const { settings } = useAppSettings(true);
  const appDisplayName = settings.appDisplayName;

  const departments = useMemo(() => {
    const set = new Set<string>();
    for (const v of vehicles) {
      set.add(resolveVehicleOrgLabel(v));
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'th'));
  }, [vehicles]);

  const { cars, vessels, all } = useMemo(
    () =>
      filterReportVehicles(vehicles, {
        category,
        status: statusFilter,
        department: departmentFilter,
      }),
    [vehicles, category, statusFilter, departmentFilter]
  );

  const summary = useMemo(() => computeNineStatusSummary(all), [all]);
  const carGroups = useMemo(() => groupCarsForReport(cars), [cars]);
  const vesselGroups = useMemo(() => groupVesselsForReport(vessels), [vessels]);

  const reporterName = personnel?.full_name || user?.username || 'ผู้ใช้งาน';
  const reporterPosition = formatCaretakerPositionLevel(personnel);
  const departmentLabel = departmentFilter === 'all' ? 'สรุปทุกส่วนราชการ' : departmentFilter;
  const generatedDateTh = formatThaiDate(getTodayIsoBangkok(), 'long');
  const generatedTimeTh = formatThaiDateTime(new Date());

  const handleExportExcel = async () => {
    if (all.length === 0) {
      showToast('ไม่มีข้อมูลยานพาหนะสำหรับส่งออก Excel', 'warning');
      return;
    }
    setExportingExcel(true);
    try {
      const fileName = await exportVehicleReportToExcel({
        cars,
        vessels,
        departmentLabel,
        reporterName,
        reporterPosition,
        reportHeaderOrg: settings.reportHeaderOrg,
        reportHeaderSub: settings.reportHeaderSub,
        appDisplayName,
      });
      showToast(`ส่งออกไฟล์ ${fileName} เรียบร้อยแล้ว`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'ไม่สามารถส่งออกไฟล์ Excel ได้', 'error');
    } finally {
      setExportingExcel(false);
    }
  };

  const handlePrintPdf = () => {
    if (all.length === 0) {
      showToast('ไม่มีข้อมูลยานพาหนะสำหรับพิมพ์รายงาน', 'warning');
      return;
    }
    window.print();
  };

  const summaryItems = [
    { label: 'ทั้งหมด', value: summary.total, tone: 'text-emerald-700 dark:text-emerald-300' },
    { label: 'ปกติ', value: summary.normal, tone: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'กำลังจะหมดอายุ', value: summary.warning, tone: 'text-amber-600 dark:text-amber-400' },
    { label: 'ซ่อมฯ/กำลังหมดอายุ', value: summary.maintenance_warning, tone: 'text-amber-600 dark:text-amber-400' },
    { label: 'ขาดต่ออายุ', value: summary.expired, tone: 'text-rose-600 dark:text-rose-400' },
    { label: 'ซ่อมฯ/ขาดต่ออายุ', value: summary.maintenance_expired, tone: 'text-rose-600 dark:text-rose-400' },
    { label: 'ซ่อมบำรุง', value: summary.maintenance, tone: 'text-sky-600 dark:text-sky-400' },
    { label: 'ยุบสภาพรอจำหน่าย', value: summary.decommissioned, tone: 'text-slate-600 dark:text-slate-300' },
    { label: 'จำหน่าย', value: summary.disposed, tone: 'text-slate-500 dark:text-slate-400' },
  ];

  return (
    <div className="space-y-5">
      {/* Filter & Export Bar (hidden on print) */}
      <div className="print:hidden rounded-2xl bg-white dark:bg-[#11231B] border border-slate-200/80 dark:border-[#244737] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-extrabold text-base text-slate-800 dark:text-white">
              ศูนย์ออกรายงานรถและเรือราชการ (A4 Print / PDF / Excel)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              จัดกลุ่มรถราชการตาม ส่วนราชการ → ประเภท → สถานะ และเรือราชการตาม ส่วนราชการ → สถานะ พร้อมสรุปยอด 9 สถานะ
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={exportingExcel || all.length === 0}
              onClick={() => void handleExportExcel()}
              className="bma-btn-outline border-emerald-600/40 text-[#00744B] dark:text-emerald-300 text-xs"
            >
              <i className={`fa-solid ${exportingExcel ? 'fa-spinner fa-spin' : 'fa-file-excel'}`} />
              <span>{exportingExcel ? 'กำลังสร้าง Excel...' : 'ส่งออก Excel (.xlsx)'}</span>
            </button>
            <button
              type="button"
              disabled={all.length === 0}
              onClick={handlePrintPdf}
              className="bma-btn-primary text-xs"
            >
              <i className="fa-solid fa-print" />
              <span>พิมพ์ / บันทึก PDF (A4)</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100 dark:border-[#244737]">
          <div>
            <label className="bma-label">กลุ่มยานพาหนะ</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ReportCategoryFilter)}
              className="bma-input text-xs"
            >
              <option value="all">ทั้งหมด (รถราชการ + เรือราชการ)</option>
              <option value="car">เฉพาะรถราชการ</option>
              <option value="vessel">เฉพาะเรือราชการ</option>
            </select>
          </div>

          <div>
            <label className="bma-label">สถานะ</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | VehicleStatusCode)}
              className="bma-input text-xs"
            >
              <option value="all">ทุกสถานะ</option>
              {ALL_VEHICLE_STATUS_ORDER.map((code) => (
                <option key={code} value={code}>
                  {VEHICLE_STATUS_MAP[code].labelTh}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="bma-label">ส่วนราชการ</label>
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="bma-input text-xs"
            >
              <option value="all">ทุกส่วนราชการ</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Printable A4 Report Sheet */}
      <div className="rounded-2xl bg-white dark:bg-[#11231B] border border-slate-200/80 dark:border-[#244737] p-6 print:border-0 print:rounded-none print:p-0 print:bg-white print:text-slate-900 space-y-6">
        {/* Official BMA A4 Header */}
        <header className="border-b-2 border-[#00744B] pb-4 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#005B2E] to-[#00744B] border-2 border-[#F6DE51] flex flex-col items-center justify-center text-white shrink-0 shadow-xs">
              <i className="fa-solid fa-landmark text-lg text-[#F6DE51]" />
              <span className="text-[9px] font-extrabold tracking-wider mt-0.5">กทม.</span>
            </div>
            <div>
              <p className="text-xs font-bold text-[#00744B] dark:text-emerald-400 print:text-[#00744B]">
                {settings.reportHeaderOrg}
                {settings.reportHeaderSub ? ` · ${settings.reportHeaderSub}` : ''}
              </p>
              <h1 className="text-lg font-extrabold text-slate-900 dark:text-white print:text-slate-900 leading-tight">
                รายงานสถานะยานพาหนะราชการ
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 print:text-slate-600">
                {appDisplayName} · {departmentLabel}
              </p>
            </div>
          </div>

          <div className="text-right text-xs leading-relaxed text-slate-600 dark:text-slate-300 print:text-slate-800 shrink-0">
            <p className="font-bold text-slate-800 dark:text-white print:text-slate-900">
              ผู้จัดทำ: {reporterName}
            </p>
            {reporterPosition && <p>{reporterPosition}</p>}
            <p>วันที่พิมพ์: {generatedDateTh}</p>
          </div>
        </header>

        {/* 9-Status Summary Strip */}
        <section className="print-avoid-break">
          <h3 className="text-xs font-extrabold text-slate-700 dark:text-slate-200 print:text-slate-800 mb-2">
            สรุปยอดยานพาหนะตามสถานะ (9 สถานะ)
          </h3>
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2 print:grid-cols-9">
            {summaryItems.map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-slate-200 dark:border-[#244737] print:border-slate-300 bg-slate-50/70 dark:bg-[#163024] print:bg-slate-50 px-2.5 py-2 text-center"
              >
                <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 print:text-slate-600 leading-tight min-h-[24px] flex items-center justify-center">
                  {item.label}
                </p>
                <p className={`text-base font-extrabold mt-0.5 ${item.tone} print:text-slate-900`}>
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        </section>

        {isLoading ? (
          <div className="py-12 text-center text-sm text-slate-400">
            <i className="fa-solid fa-spinner fa-spin mr-2" />
            กำลังโหลดข้อมูลรายงาน...
          </div>
        ) : all.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">
            ไม่พบข้อมูลยานพาหนะตามเงื่อนไขที่เลือก
          </div>
        ) : (
          <>
            {/* Section 1: Cars Report (ส่วนราชการ -> ประเภท -> สถานะ) */}
            {(category === 'all' || category === 'car') && (
              <section className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#244737] print:border-slate-300 pb-2">
                  <h2 className="text-sm font-extrabold text-[#00744B] dark:text-emerald-300 print:text-[#00744B] flex items-center gap-2">
                    <i className="fa-solid fa-car-side" />
                    <span>ส่วนที่ 1: รายงานรถราชการ ({cars.length} คัน)</span>
                  </h2>
                </div>

                {carGroups.length === 0 ? (
                  <p className="text-xs italic text-slate-400">- ไม่มีข้อมูลรถราชการตามเงื่อนไขที่เลือก -</p>
                ) : (
                  carGroups.map((deptGrp) => (
                    <div key={deptGrp.department} className="space-y-3">
                      <h3 className="text-xs font-extrabold text-slate-800 dark:text-white print:text-slate-900 bg-emerald-500/10 print:bg-slate-100 px-3 py-1.5 rounded-lg">
                        ส่วนราชการ: {deptGrp.department}
                      </h3>
                      {deptGrp.types.map((typeGrp) => (
                        <div key={typeGrp.vehicleTypeName} className="pl-2 sm:pl-4 space-y-2.5">
                          <p className="text-xs font-bold text-slate-700 dark:text-emerald-200 print:text-slate-800">
                            ประเภท: {typeGrp.vehicleTypeName}
                          </p>
                          {typeGrp.statuses.map((stGrp) => (
                            <div key={stGrp.statusCode} className="print-avoid-break space-y-1.5">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-semibold text-slate-600 dark:text-slate-300 print:text-slate-700">
                                  สถานะ: {stGrp.statusLabelTh}
                                </span>
                                <span className="text-[11px] font-bold text-slate-500">
                                  จำนวน {stGrp.rows.length} คัน
                                </span>
                              </div>
                              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[#244737] print:border-slate-400 print:rounded-none">
                                <table className="w-full text-xs text-left border-collapse">
                                  <thead className="bg-slate-50 dark:bg-[#163024] print:bg-slate-100 text-slate-700 dark:text-emerald-200 print:text-slate-900 font-bold">
                                    <tr>
                                      <th className="px-3 py-2 w-12 text-center border-b border-slate-200 dark:border-[#244737] print:border-slate-400">
                                        ลำดับ
                                      </th>
                                      <th className="px-3 py-2 border-b border-slate-200 dark:border-[#244737] print:border-slate-400">
                                        ทะเบียน
                                      </th>
                                      <th className="px-3 py-2 border-b border-slate-200 dark:border-[#244737] print:border-slate-400">
                                        จังหวัด
                                      </th>
                                      <th className="px-3 py-2 border-b border-slate-200 dark:border-[#244737] print:border-slate-400">
                                        ผู้ดูแล
                                      </th>
                                      <th className="px-3 py-2 border-b border-slate-200 dark:border-[#244737] print:border-slate-400 whitespace-nowrap">
                                        สิ้นอายุภาษี
                                      </th>
                                      <th className="px-3 py-2 border-b border-slate-200 dark:border-[#244737] print:border-slate-400 print:hidden">
                                        สถานะ
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 dark:divide-[#244737] print:divide-slate-300">
                                    {stGrp.rows.map((v, idx) => (
                                      <tr key={v.id}>
                                        <td className="px-3 py-1.5 text-center">{idx + 1}</td>
                                        <td className="px-3 py-1.5 font-bold">{v.license_plate || '-'}</td>
                                        <td className="px-3 py-1.5">{v.province || '-'}</td>
                                        <td className="px-3 py-1.5">
                                          <span>{v.caretaker_name || '-'}</span>
                                          {formatVehicleCaretakerPositionLevel(v) && (
                                            <span className="block text-[10px] text-slate-500 print:text-slate-600">
                                              {formatVehicleCaretakerPositionLevel(v)}
                                            </span>
                                          )}
                                        </td>
                                        <td className="px-3 py-1.5 font-mono whitespace-nowrap">
                                          {formatThaiDate(v.current_expiry_date, 'numeric')}
                                        </td>
                                        <td className="px-3 py-1.5 print:hidden">
                                          <VehicleStatusBadge status={stGrp.statusCode} />
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </section>
            )}

            {/* Section 2: Vessels Report (ส่วนราชการ -> สถานะ) */}
            {(category === 'all' || category === 'vessel') && (
              <section className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#244737] print:border-slate-300 pb-2">
                  <h2 className="text-sm font-extrabold text-sky-700 dark:text-sky-300 print:text-sky-900 flex items-center gap-2">
                    <i className="fa-solid fa-ship" />
                    <span>ส่วนที่ 2: รายงานเรือราชการ ({vessels.length} ลำ)</span>
                  </h2>
                </div>

                {vesselGroups.length === 0 ? (
                  <p className="text-xs italic text-slate-400">- ไม่มีข้อมูลเรือราชการตามเงื่อนไขที่เลือก -</p>
                ) : (
                  vesselGroups.map((deptGrp) => (
                    <div key={deptGrp.department} className="space-y-3">
                      <h3 className="text-xs font-extrabold text-slate-800 dark:text-white print:text-slate-900 bg-sky-500/10 print:bg-slate-100 px-3 py-1.5 rounded-lg">
                        ส่วนราชการ: {deptGrp.department}
                      </h3>
                      {deptGrp.statuses.map((stGrp) => (
                        <div key={stGrp.statusCode} className="pl-2 sm:pl-4 print-avoid-break space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-slate-600 dark:text-slate-300 print:text-slate-700">
                              สถานะ: {stGrp.statusLabelTh}
                            </span>
                            <span className="text-[11px] font-bold text-slate-500">
                              จำนวน {stGrp.rows.length} ลำ
                            </span>
                          </div>
                          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[#244737] print:border-slate-400 print:rounded-none">
                            <table className="w-full text-xs text-left border-collapse">
                              <thead className="bg-slate-50 dark:bg-[#163024] print:bg-slate-100 text-slate-700 dark:text-emerald-200 print:text-slate-900 font-bold">
                                <tr>
                                  <th className="px-3 py-2 w-12 text-center border-b border-slate-200 dark:border-[#244737] print:border-slate-400">
                                    ลำดับ
                                  </th>
                                  <th className="px-3 py-2 border-b border-slate-200 dark:border-[#244737] print:border-slate-400">
                                    ชื่อเรือ
                                  </th>
                                  <th className="px-3 py-2 border-b border-slate-200 dark:border-[#244737] print:border-slate-400">
                                    ทะเบียน / เลขที่ใบอนุญาตเรือ
                                  </th>
                                  <th className="px-3 py-2 border-b border-slate-200 dark:border-[#244737] print:border-slate-400">
                                    ผู้ดูแล
                                  </th>
                                  <th className="px-3 py-2 border-b border-slate-200 dark:border-[#244737] print:border-slate-400 whitespace-nowrap">
                                    สิ้นอายุใบอนุญาต
                                  </th>
                                  <th className="px-3 py-2 border-b border-slate-200 dark:border-[#244737] print:border-slate-400 print:hidden">
                                    สถานะ
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-[#244737] print:divide-slate-300">
                                {stGrp.rows.map((v, idx) => (
                                  <tr key={v.id}>
                                    <td className="px-3 py-1.5 text-center">{idx + 1}</td>
                                    <td className="px-3 py-1.5 font-bold">{v.vessel_name || '-'}</td>
                                    <td className="px-3 py-1.5">{v.vessel_license_no || '-'}</td>
                                    <td className="px-3 py-1.5">{v.caretaker_name || '-'}</td>
                                    <td className="px-3 py-1.5 font-mono whitespace-nowrap">
                                      {formatThaiDate(v.current_expiry_date, 'numeric')}
                                    </td>
                                    <td className="px-3 py-1.5 print:hidden">
                                      <VehicleStatusBadge status={stGrp.statusCode} />
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </section>
            )}

            {/* Print Signature Footer */}
            <footer className="hidden print:flex justify-between items-end pt-10 mt-8 border-t border-slate-300 print-avoid-break text-xs">
              <div className="text-slate-600">
                <p>สร้างเอกสารจาก {appDisplayName}</p>
                <p>เวลาพิมพ์: {generatedTimeTh}</p>
              </div>
              <div className="text-center w-64 space-y-2">
                <p>ลงชื่อ ..........................................................</p>
                <p>({reporterName})</p>
                <p>{reporterPosition || 'เจ้าหน้าที่ผู้รับผิดชอบ'}</p>
              </div>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
