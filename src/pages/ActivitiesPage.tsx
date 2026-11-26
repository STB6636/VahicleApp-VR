import { useQuery } from '@tanstack/react-query';
import { vehicleService } from '@/services/vehicleService';
import { QUERY_KEYS } from '@/lib/queryClient';
import { formatThaiDateTime } from '@/lib/thaiDate';

export function ActivitiesPage() {
  const { data: activities = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.activities(),
    queryFn: () => vehicleService.listRecentActivities(30),
  });

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white dark:bg-[#11231B] border border-slate-200/80 dark:border-[#244737] p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-extrabold text-base text-slate-800 dark:text-white">
            บันทึกต่ออายุภาษี ซ่อมบำรุง ยุบสภาพ และจำหน่าย
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            รองรับการบันทึกแบบ 1 คัน หรือหลายคันพร้อมกันผ่าน RPC <code>vehicleapp.fn_record_vehicle_activity</code>
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/12 text-[#00744B] dark:text-emerald-300 text-xs font-bold">
          <i className="fa-solid fa-layer-group" />
          <span>Multi-Vehicle Modal (Phase 2)</span>
        </span>
      </div>

      <div className="rounded-2xl bg-white dark:bg-[#11231B] border border-slate-200/80 dark:border-[#244737] overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-slate-400">กำลังโหลดประวัติกิจกรรม...</div>
          ) : activities.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">
              ยังไม่มีประวัติการทำรายการใน Schema <code>vehicleapp</code>
            </div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 dark:bg-[#163024] text-xs font-bold text-slate-600 dark:text-emerald-200">
                <tr>
                  <th className="px-4 py-3">รหัส</th>
                  <th className="px-4 py-3">ประเภทรายการ</th>
                  <th className="px-4 py-3">เอกสารอ้างอิง</th>
                  <th className="px-4 py-3">ผู้บันทึก</th>
                  <th className="px-4 py-3">วันเวลาบันทึก</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#244737]">
                {activities.map((act) => (
                  <tr key={act.id}>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{act.activity_code}</td>
                    <td className="px-4 py-3 font-bold">{act.activity_label_th}</td>
                    <td className="px-4 py-3">{act.document_no || '-'}</td>
                    <td className="px-4 py-3">{act.recorded_by_name}</td>
                    <td className="px-4 py-3 font-mono text-xs">{formatThaiDateTime(act.recorded_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
