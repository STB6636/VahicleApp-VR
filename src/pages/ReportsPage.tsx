import { useQuery } from '@tanstack/react-query';
import { vehicleService } from '@/services/vehicleService';
import { QUERY_KEYS } from '@/lib/queryClient';

export function ReportsPage() {
  const { data: vehicles = [] } = useQuery({
    queryKey: QUERY_KEYS.vehicles,
    queryFn: vehicleService.listVehicles,
  });

  const carsCount = vehicles.filter((v) => !v.is_vessel).length;
  const vesselsCount = vehicles.filter((v) => v.is_vessel).length;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white dark:bg-[#11231B] border border-slate-200/80 dark:border-[#244737] p-6">
        <h2 className="font-extrabold text-base text-slate-800 dark:text-white">
          ศูนย์ออกรายงานรถและเรือราชการ (PDF / Print / Excel)
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          รองรับการจัดกลุ่มตามส่วนราชการ → ประเภท → สถานะ พร้อมหัวกระดาษตราสัญลักษณ์ กทม. (Phase 3)
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
          <div className="rounded-2xl border border-slate-200 dark:border-[#244737] p-4 bg-slate-50/70 dark:bg-[#183025]">
            <p className="text-xs font-bold text-slate-500">กลุ่มรายงานรถราชการ</p>
            <p className="text-2xl font-extrabold text-[#00744B] dark:text-emerald-400 mt-1">
              {carsCount} คัน
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 dark:border-[#244737] p-4 bg-slate-50/70 dark:bg-[#183025]">
            <p className="text-xs font-bold text-slate-500">กลุ่มรายงานเรือราชการ</p>
            <p className="text-2xl font-extrabold text-sky-600 dark:text-sky-400 mt-1">
              {vesselsCount} ลำ
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
