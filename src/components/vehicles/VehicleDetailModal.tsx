import { useQuery } from '@tanstack/react-query';
import { ResponsiveModal } from '@/components/common/ResponsiveModal';
import { VehicleStatusBadge } from '@/components/common/VehicleStatusBadge';
import { vehicleService } from '@/services/vehicleService';
import { useAppSettings } from '@/hooks/useAppSettings';
import { QUERY_KEYS } from '@/lib/queryClient';
import { formatThaiDate, formatThaiDateTime } from '@/lib/thaiDate';
import { formatVehicleCaretakerPositionLevel } from '@/lib/caretakerFormatter';
import { useAuthStore, isVehicleSuperAdmin } from '@/stores/useAuthStore';
import type { VehicleEnrichedRow } from '@/types/vehicle.types';

export interface VehicleDetailModalProps {
  vehicle: VehicleEnrichedRow | null;
  onClose: () => void;
  canManage: boolean;
  onEdit?: (vehicle: VehicleEnrichedRow) => void;
  onRecordActivity?: (vehicle: VehicleEnrichedRow) => void;
}

export function VehicleDetailModal({
  vehicle,
  onClose,
  canManage,
  onEdit,
  onRecordActivity,
}: VehicleDetailModalProps) {
  const user = useAuthStore((s) => s.user);
  const appPermission = useAuthStore((s) => s.appPermission);
  const isSuper = isVehicleSuperAdmin(user, appPermission);
  const { settings } = useAppSettings(Boolean(vehicle));

  const { data: activities = [], isLoading: loadingHistory } = useQuery({
    queryKey: QUERY_KEYS.activities(vehicle?.id),
    queryFn: () => vehicleService.listRecentActivities(20, vehicle?.id),
    enabled: Boolean(vehicle?.id),
  });

  if (!vehicle) return null;

  const status = vehicle.computed_status_code || vehicle.status_code;
  const days = vehicle.days_until_expiry;
  const canRecordForVehicle = Boolean(onRecordActivity && (status !== 'DISPOSED' || isSuper));
  const caretakerPosLevel = formatVehicleCaretakerPositionLevel(vehicle);

  return (
    <ResponsiveModal
      open={Boolean(vehicle)}
      onClose={onClose}
      title={`${vehicle.vehicle_label}`}
      subtitle={`${vehicle.vehicle_code} · ${vehicle.vehicle_type_name}`}
      icon={vehicle.is_vessel ? 'fa-ship' : 'fa-car-side'}
      size="xl"
      footer={
        <>
          <button type="button" onClick={onClose} className="bma-btn-outline">
            ปิดหน้าต่าง
          </button>
          {canRecordForVehicle && onRecordActivity && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onRecordActivity(vehicle);
              }}
              className="bma-btn-outline border-emerald-500/40 text-[#00744B] dark:text-emerald-300"
            >
              <i className="fa-solid fa-clipboard-check" />
              <span>บันทึกกิจกรรม</span>
            </button>
          )}
          {canManage && onEdit && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onEdit(vehicle);
              }}
              className="bma-btn-primary"
            >
              <i className="fa-solid fa-pen-to-square" />
              <span>แก้ไขข้อมูล</span>
            </button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        {/* Status Summary Banner */}
        <div className="rounded-2xl bg-slate-50 dark:bg-[#163024] border border-slate-200 dark:border-[#244737] p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs text-slate-500 dark:text-slate-400">สถานะปัจจุบัน</p>
            <div className="flex items-center gap-2">
              <VehicleStatusBadge status={status} />
              {days !== null && status !== 'DISPOSED' && status !== 'DECOMMISSIONED' && (
                <span
                  className={`text-xs font-bold ${
                    days < 0
                      ? 'text-rose-600 dark:text-rose-400'
                      : days <= settings.warningDaysBefore
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-emerald-700 dark:text-emerald-300'
                  }`}
                >
                  {days < 0
                    ? `เกินกำหนด ${Math.abs(days)} วัน`
                    : days === 0
                      ? 'ครบกำหนดวันนี้'
                      : `คงเหลือ ${days} วัน`}
                </span>
              )}
            </div>
          </div>

          <div className="text-right">
            <p className="text-xs text-slate-500 dark:text-slate-400">วันสิ้นอายุล่าสุด</p>
            <p className="text-base font-extrabold text-slate-800 dark:text-white">
              {formatThaiDate(vehicle.current_expiry_date, 'long') || '-'}
            </p>
          </div>
        </div>

        {/* Detail Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
          <InfoItem label="รหัสยานพาหนะ" value={vehicle.vehicle_code} mono />
          <InfoItem label="ประเภท" value={vehicle.vehicle_type_name} />

          {vehicle.is_vessel ? (
            <>
              <InfoItem label="ชื่อเรือ" value={vehicle.vessel_name} />
              <InfoItem label="เลขที่ใบอนุญาตเรือ" value={vehicle.vessel_license_no} />
            </>
          ) : (
            <>
              <InfoItem label="หมายเลขทะเบียน" value={vehicle.license_plate} />
              <InfoItem label="จังหวัด" value={vehicle.province} />
              <InfoItem label="ยี่ห้อ (Brand)" value={vehicle.brand} />
              <InfoItem label="รุ่น (Model)" value={vehicle.model} />
              <InfoItem label="ปีที่จดทะเบียน" value={vehicle.model_year != null ? String(vehicle.model_year) : null} />
              <InfoItem label="ความจุกระบอกสูบ (CC)" value={vehicle.engine_cc != null ? `${vehicle.engine_cc.toLocaleString('th-TH')} CC` : null} />
              <InfoItem label="ราคา" value={vehicle.price != null ? `${Number(vehicle.price).toLocaleString('th-TH')} บาท` : null} />
            </>
          )}

          <InfoItem label="วันที่ได้มา" value={formatThaiDate(vehicle.acquisition_date, 'long')} />
          {vehicle.status_code === 'DISPOSED' && (
            <InfoItem label="วันที่จำหน่าย" value={formatThaiDate(vehicle.disposal_date, 'long')} danger />
          )}
          <InfoItem label="สำนักงาน (Lv2)" value={vehicle.office_name} />
          <InfoItem label="ฝ่าย / ส่วน (Lv3)" value={vehicle.department_name} />
          <InfoItem label="กลุ่มงาน (Lv4)" value={vehicle.division_name} />
          <InfoItem label="ผู้ดูแลยานพาหนะ" value={vehicle.caretaker_name} />
          <InfoItem label="ตำแหน่งและระดับผู้ดูแล" value={caretakerPosLevel} />
        </div>

        {vehicle.latest_file_url && (
          <div className="rounded-xl border border-sky-200 dark:border-sky-900 bg-sky-50/50 dark:bg-sky-950/25 px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs font-bold text-sky-800 dark:text-sky-200">
              <i className="fa-solid fa-file-pdf text-base" />
              <span>เอกสารแนบล่าสุด (Google Drive)</span>
            </div>
            <a
              href={vehicle.latest_file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold transition"
            >
              <i className="fa-solid fa-up-right-from-square mr-1.5" />
              เปิดดูเอกสาร
            </a>
          </div>
        )}

        {vehicle.remarks && (
          <div className="rounded-xl bg-slate-50 dark:bg-[#163024] border border-slate-200 dark:border-[#244737] p-3.5">
            <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">หมายเหตุ</p>
            <p className="text-xs text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{vehicle.remarks}</p>
          </div>
        )}

        {/* Activity Timeline */}
        <div className="space-y-2.5">
          <h4 className="text-xs font-extrabold text-slate-700 dark:text-slate-200 flex items-center gap-2">
            <i className="fa-solid fa-clock-rotate-left text-[#00744B] dark:text-emerald-400" />
            ประวัติการต่อภาษีและกิจกรรมของยานพาหนะนี้ ({activities.length})
          </h4>
          {loadingHistory ? (
            <p className="text-xs text-slate-400 py-4 text-center">กำลังโหลดประวัติกิจกรรม...</p>
          ) : activities.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center rounded-xl border border-dashed border-slate-200 dark:border-[#244737]">
              ยังไม่มีประวัติกิจกรรมสำหรับยานพาหนะรายการนี้
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-[#244737] rounded-xl border border-slate-200 dark:border-[#244737] overflow-hidden">
              {activities.map((act) => (
                <div key={act.id} className="px-3.5 py-2.5 bg-white dark:bg-[#11231B] flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="space-y-0.5 min-w-0">
                    <p className="font-bold text-slate-800 dark:text-white">
                      {act.activity_label_th}{' '}
                      <span className="font-mono text-[11px] text-slate-400">({act.activity_code})</span>
                    </p>
                    <p className="text-slate-500 dark:text-slate-400">
                      เอกสาร: {act.document_no || '-'}
                      {act.expiry_date ? ` · สิ้นอายุใหม่ ${formatThaiDate(act.expiry_date)}` : ''}
                      {act.location ? ` · สถานที่ ${act.location}` : ''}
                    </p>
                    {act.details && <p className="text-slate-600 dark:text-slate-300">{act.details}</p>}
                  </div>
                  <div className="text-right shrink-0 space-y-1">
                    <p className="text-[11px] text-slate-500">{act.recorded_by_name}</p>
                    <p className="font-mono text-[10px] text-slate-400">{formatThaiDateTime(act.recorded_at)}</p>
                    {act.file_url && (
                      <a
                        href={act.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-600 dark:text-sky-400 hover:underline"
                      >
                        <i className="fa-solid fa-paperclip" />
                        เอกสารแนบ
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ResponsiveModal>
  );
}

function InfoItem({
  label,
  value,
  mono = false,
  danger = false,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="rounded-xl bg-slate-50/80 dark:bg-[#163024]/70 border border-slate-200/70 dark:border-[#244737] px-3 py-2">
      <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{label}</p>
      <p
        className={`text-xs font-bold mt-0.5 break-words ${
          danger ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-white'
        } ${mono ? 'font-mono' : ''}`}
      >
        {value || '-'}
      </p>
    </div>
  );
}
