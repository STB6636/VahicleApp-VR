import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ResponsiveModal } from '@/components/common/ResponsiveModal';
import { vehicleService } from '@/services/vehicleService';
import { QUERY_KEYS } from '@/lib/queryClient';
import { useUiStore } from '@/stores/useUiStore';
import type { VehicleActivityRow, VehicleEnrichedRow } from '@/types/vehicle.types';

export interface ActivityEditModalProps {
  activity: VehicleActivityRow | null;
  vehicle?: VehicleEnrichedRow | null;
  onClose: () => void;
}

export function ActivityEditModal({ activity, vehicle, onClose }: ActivityEditModalProps) {
  const qc = useQueryClient();
  const showToast = useUiStore((s) => s.showToast);

  const [documentNo, setDocumentNo] = useState('');
  const [location, setLocation] = useState('');
  const [details, setDetails] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activity) return;
    setDocumentNo(activity.document_no || '');
    setLocation(activity.location || '');
    setDetails(activity.details || '');
    setError(null);
  }, [activity]);

  if (!activity) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await vehicleService.updateActivity(activity.id, {
        document_no: documentNo.trim() || null,
        location: location.trim() || null,
        details: details.trim() || null,
      });
      showToast('อัปเดตข้อมูลประวัติกิจกรรมเรียบร้อยแล้ว', 'success');
      await Promise.all([
        qc.invalidateQueries({ queryKey: QUERY_KEYS.activities() }),
        qc.invalidateQueries({ queryKey: QUERY_KEYS.activities(activity.vehicle_id) }),
      ]);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถแก้ไขประวัติกิจกรรมได้');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveModal
      open={Boolean(activity)}
      onClose={onClose}
      title={`แก้ไขข้อมูลประวัติ (${activity.activity_code})`}
      subtitle={activity.activity_label_th}
      icon="fa-pen-to-square"
      size="md"
      preventBackdropClose={saving}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={saving} className="bma-btn-outline">
            ยกเลิก
          </button>
          <button
            type="submit"
            form="activity-edit-form"
            disabled={saving}
            className="bma-btn-primary"
          >
            <i className={`fa-solid ${saving ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`} />
            <span>{saving ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}</span>
          </button>
        </>
      }
    >
      <form id="activity-edit-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-xl border border-rose-300 bg-rose-50 dark:bg-rose-950/40 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-200">
            {error}
          </div>
        )}

        <div className="rounded-xl bg-slate-50 dark:bg-[#163024] border border-slate-200 dark:border-[#244737] p-3 text-xs space-y-1">
          <p>
            <span className="text-slate-500">รายการ:</span>{' '}
            <strong className="text-slate-800 dark:text-white">{activity.activity_label_th}</strong>
          </p>
          <p>
            <span className="text-slate-500">ยานพาหนะ:</span>{' '}
            <strong className="text-slate-800 dark:text-white">
              {vehicle ? `[${vehicle.vehicle_type_name}] ${vehicle.vehicle_label}` : activity.vehicle_id}
            </strong>
          </p>
        </div>

        <div>
          <label className="bma-label">เลขที่เอกสาร / ใบอนุญาต / เล่มอ้างอิง</label>
          <input
            type="text"
            value={documentNo}
            onChange={(e) => setDocumentNo(e.target.value)}
            className="bma-input"
          />
        </div>

        <div>
          <label className="bma-label">สถานที่ (ถ้ามี)</label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="bma-input"
          />
        </div>

        <div>
          <label className="bma-label">รายละเอียดเพิ่มเติม</label>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={3}
            className="bma-input"
          />
        </div>
      </form>
    </ResponsiveModal>
  );
}
