import { ResponsiveModal } from '@/components/common/ResponsiveModal';
import { VehicleStatusBadge } from '@/components/common/VehicleStatusBadge';
import { formatThaiDate, formatThaiDateTime } from '@/lib/thaiDate';
import type { VehicleActivityRow, VehicleEnrichedRow } from '@/types/vehicle.types';

export interface ActivityDetailModalProps {
  activity: VehicleActivityRow | null;
  vehicle?: VehicleEnrichedRow | null;
  onClose: () => void;
  canEdit?: boolean;
  onEdit?: (activity: VehicleActivityRow) => void;
}

export function ActivityDetailModal({
  activity,
  vehicle,
  onClose,
  canEdit = false,
  onEdit,
}: ActivityDetailModalProps) {
  if (!activity) return null;

  return (
    <ResponsiveModal
      open={Boolean(activity)}
      onClose={onClose}
      title={`รายละเอียดกิจกรรม (${activity.activity_code})`}
      subtitle={activity.activity_label_th}
      icon="fa-file-lines"
      size="md"
      footer={
        <>
          <button type="button" onClick={onClose} className="bma-btn-outline">
            ปิด
          </button>
          {canEdit && onEdit && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onEdit(activity);
              }}
              className="bma-btn-primary"
            >
              <i className="fa-solid fa-pen-to-square" />
              <span>แก้ไขประวัติ</span>
            </button>
          )}
        </>
      }
    >
      <div className="space-y-4 text-xs">
        <div className="rounded-xl bg-slate-50 dark:bg-[#163024] border border-slate-200 dark:border-[#244737] p-3.5 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] text-slate-500">ยานพาหนะ</p>
            <p className="text-sm font-extrabold text-slate-800 dark:text-white">
              {vehicle ? `[${vehicle.vehicle_type_name}] ${vehicle.vehicle_label}` : activity.vehicle_id}
            </p>
            {vehicle && (
              <p className="text-[11px] text-slate-500 mt-0.5">
                {vehicle.department_name || vehicle.office_name || '-'}
              </p>
            )}
          </div>
          {activity.previous_status && activity.new_status && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <VehicleStatusBadge status={activity.previous_status} />
              <i className="fa-solid fa-arrow-right text-slate-400 text-[10px]" />
              <VehicleStatusBadge status={activity.new_status} />
            </div>
          )}
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <DetailField label="เลขที่เอกสารอ้างอิง" value={activity.document_no} />
          <DetailField label="สถานที่" value={activity.location} />
          <DetailField label="วันที่เริ่ม / ดำเนินการ" value={formatThaiDate(activity.start_date, 'long')} />
          <DetailField label="วันสิ้นอายุใหม่" value={formatThaiDate(activity.expiry_date, 'long')} />
          <DetailField label="ผู้บันทึก" value={activity.recorded_by_name} />
          <DetailField label="วันเวลาที่บันทึก" value={formatThaiDateTime(activity.recorded_at)} />
          {activity.updated_by_name && (
            <>
              <DetailField label="แก้ไขล่าสุดโดย" value={activity.updated_by_name} />
              <DetailField label="วันเวลาที่แก้ไข" value={formatThaiDateTime(activity.updated_at)} />
            </>
          )}
        </dl>

        {activity.details && (
          <div className="rounded-xl bg-slate-50 dark:bg-[#163024] border border-slate-200 dark:border-[#244737] p-3">
            <p className="text-[11px] font-bold text-slate-500 mb-1">รายละเอียดเพิ่มเติม</p>
            <p className="text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{activity.details}</p>
          </div>
        )}

        {activity.file_url && (
          <div className="rounded-xl border border-sky-200 dark:border-sky-900 bg-sky-50/60 dark:bg-sky-950/25 px-3.5 py-2.5 flex items-center justify-between gap-2">
            <span className="font-bold text-sky-800 dark:text-sky-200 truncate">
              <i className="fa-solid fa-paperclip mr-1.5" />
              {activity.file_name || 'เอกสารหลักฐานแนบ'}
            </span>
            <a
              href={activity.file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold shrink-0"
            >
              เปิดดูไฟล์
            </a>
          </div>
        )}
      </div>
    </ResponsiveModal>
  );
}

function DetailField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-xl bg-slate-50/70 dark:bg-[#163024]/60 border border-slate-200/70 dark:border-[#244737] px-3 py-2">
      <dt className="text-[11px] text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="font-bold text-slate-800 dark:text-white mt-0.5 break-words">{value || '-'}</dd>
    </div>
  );
}
