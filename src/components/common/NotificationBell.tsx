import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { vehicleService } from '@/services/vehicleService';
import { QUERY_KEYS } from '@/lib/queryClient';
import {
  VEHICLE_STATUS_MAP,
  buildNotificationRefKey,
} from '@/lib/vehicleStatus';
import { VehicleStatusBadge } from '@/components/common/VehicleStatusBadge';
import { formatThaiDate } from '@/lib/thaiDate';
import type { VehicleEnrichedRow } from '@/types/vehicle.types';

export interface VehicleNotificationItem {
  refKey: string;
  vehicle: VehicleEnrichedRow;
  isRead: boolean;
  priority: number;
}

export function buildVehicleNotifications(
  vehicles: VehicleEnrichedRow[],
  readRefKeys: ReadonlySet<string>
): VehicleNotificationItem[] {
  return vehicles
    .filter((v) => {
      const st = v.computed_status_code || v.status_code;
      return (
        st === 'EXPIRED' ||
        st === 'MAINTENANCE_EXPIRED' ||
        st === 'WARNING' ||
        st === 'MAINTENANCE_WARNING'
      );
    })
    .map((v) => {
      const st = v.computed_status_code || v.status_code;
      const refKey = buildNotificationRefKey(v);
      return {
        refKey,
        vehicle: v,
        isRead: readRefKeys.has(refKey),
        priority: VEHICLE_STATUS_MAP[st]?.priority ?? 99,
      };
    })
    .sort((a, b) => {
      if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
      if (a.priority !== b.priority) return a.priority - b.priority;
      return String(a.vehicle.current_expiry_date || '').localeCompare(
        String(b.vehicle.current_expiry_date || '')
      );
    });
}

export function NotificationBell() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  const { data: vehicles = [] } = useQuery({
    queryKey: QUERY_KEYS.vehicles,
    queryFn: vehicleService.listVehicles,
  });

  const { data: reads = [] } = useQuery({
    queryKey: QUERY_KEYS.notificationReads,
    queryFn: vehicleService.listNotificationReads,
  });

  const markReadMutation = useMutation({
    mutationFn: (refKeys: string[]) => vehicleService.markNotificationsRead(refKeys),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.notificationReads });
    },
  });

  const readSet = useMemo(() => new Set(reads.map((r) => r.ref_key)), [reads]);

  const items = useMemo(
    () => buildVehicleNotifications(vehicles, readSet),
    [vehicles, readSet]
  );

  const unreadItems = useMemo(() => items.filter((i) => !i.isRead), [items]);
  const unreadCount = unreadItems.length;

  useEffect(() => {
    if (!open) return undefined;
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const handleOpenItem = (item: VehicleNotificationItem) => {
    if (!item.isRead) {
      markReadMutation.mutate([item.refKey]);
    }
    setOpen(false);
    navigate('/activities', { state: { preselectedVehicleId: item.vehicle.id } });
  };

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="แจ้งเตือนวันสิ้นอายุยานพาหนะ"
        className="relative w-9 h-9 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center transition"
      >
        <i className="fa-regular fa-bell text-sm" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-extrabold flex items-center justify-center shadow-xs">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white dark:bg-[#11231B] border border-slate-200 dark:border-[#244737] shadow-2xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-[#244737] flex items-center justify-between gap-2 bg-slate-50/80 dark:bg-[#163024]">
            <div>
              <p className="text-xs font-extrabold text-slate-800 dark:text-white">
                แจ้งเตือนวันสิ้นอายุภาษี / ใบอนุญาต
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                ยังไม่อ่าน {unreadCount} รายการ จากทั้งหมด {items.length} รายการ
              </p>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                disabled={markReadMutation.isPending}
                onClick={() => markReadMutation.mutate(unreadItems.map((i) => i.refKey))}
                className="text-[11px] font-bold text-[#00744B] dark:text-emerald-400 hover:underline shrink-0"
              >
                อ่านทั้งหมด
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-[#244737]">
            {items.length === 0 ? (
              <div className="py-10 px-4 text-center text-xs text-slate-400">
                <i className="fa-solid fa-circle-check text-2xl text-emerald-500/60 mb-2 block" />
                ไม่มียานพาหนะที่ขาดต่ออายุหรือใกล้หมดอายุในขณะนี้
              </div>
            ) : (
              items.slice(0, 30).map((item) => {
                const v = item.vehicle;
                const st = v.computed_status_code || v.status_code;
                const days = v.days_until_expiry;
                return (
                  <button
                    key={item.refKey}
                    type="button"
                    onClick={() => handleOpenItem(item)}
                    className={`w-full text-left px-4 py-3 flex items-start gap-3 transition hover:bg-slate-50 dark:hover:bg-white/5 ${
                      item.isRead ? 'opacity-65' : 'bg-emerald-50/35 dark:bg-emerald-950/20'
                    }`}
                  >
                    <span
                      className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                        item.isRead ? 'bg-slate-300 dark:bg-slate-600' : 'bg-rose-500'
                      }`}
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-extrabold text-slate-800 dark:text-white truncate">
                          {v.vehicle_label}
                        </p>
                        <VehicleStatusBadge status={st} />
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {v.vehicle_type_name} · {v.department_name || v.office_name || 'ไม่ระบุสังกัด'}
                      </p>
                      <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                        สิ้นอายุ: {formatThaiDate(v.current_expiry_date)}{' '}
                        {days !== null && (
                          <span className={days < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}>
                            ({days < 0 ? `เกินกำหนด ${Math.abs(days)} วัน` : days === 0 ? 'หมดอายุวันนี้' : `เหลือ ${days} วัน`})
                          </span>
                        )}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
