import type { VehicleStatusCode } from '@/types/vehicle.types';
import { VEHICLE_STATUS_MAP } from '@/lib/vehicleStatus';

const TONE_CLASS_MAP: Record<string, string> = {
  success: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  warning: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  danger: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
  info: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
  muted: 'bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/30',
};

export function VehicleStatusBadge({ status }: { status: VehicleStatusCode }) {
  const meta = VEHICLE_STATUS_MAP[status] ?? VEHICLE_STATUS_MAP.NORMAL;
  const toneCls = TONE_CLASS_MAP[meta.tone] ?? TONE_CLASS_MAP.muted;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border whitespace-nowrap ${toneCls}`}
    >
      <i className={`fa-solid ${meta.icon} text-[10px]`} />
      <span>{meta.labelTh}</span>
    </span>
  );
}
