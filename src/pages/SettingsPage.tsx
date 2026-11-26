import { useQuery } from '@tanstack/react-query';
import { vehicleService } from '@/services/vehicleService';
import { QUERY_KEYS } from '@/lib/queryClient';

export function SettingsPage() {
  const { data: settings = [] } = useQuery({
    queryKey: QUERY_KEYS.settings,
    queryFn: vehicleService.listSettings,
  });

  const { data: health } = useQuery({
    queryKey: QUERY_KEYS.schemaHealth,
    queryFn: vehicleService.getSchemaHealth,
  });

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white dark:bg-[#11231B] border border-slate-200/80 dark:border-[#244737] p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-extrabold text-base text-slate-800 dark:text-white">
              สุขภาพฐานข้อมูล Schema <code>vehicleapp</code>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              ตรวจสอบการเชื่อมต่อ Multi-Schema บน Supabase โปรเจกต์เดียวกับ Portal SSO-VR
            </p>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
            {health?.healthy ? 'Schema Healthy' : 'Waiting Exposed Schema'}
          </span>
        </div>

        {health && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#183025]">
              <p className="text-slate-500">Vehicle Types</p>
              <p className="text-lg font-extrabold mt-0.5">{health.vehicle_types_count}</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#183025]">
              <p className="text-slate-500">Vehicles</p>
              <p className="text-lg font-extrabold mt-0.5">{health.vehicles_count}</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#183025]">
              <p className="text-slate-500">Activities</p>
              <p className="text-lg font-extrabold mt-0.5">{health.activities_count}</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#183025]">
              <p className="text-slate-500">Settings</p>
              <p className="text-lg font-extrabold mt-0.5">{health.settings_count}</p>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-white dark:bg-[#11231B] border border-slate-200/80 dark:border-[#244737] p-5">
        <h2 className="font-extrabold text-base text-slate-800 dark:text-white mb-3">
          พารามิเตอร์ตั้งค่าระบบ (vehicleapp.app_settings)
        </h2>
        <div className="divide-y divide-slate-100 dark:divide-[#244737]">
          {settings.map((row) => (
            <div key={row.key} className="py-3 flex flex-wrap items-center justify-between gap-2 text-sm">
              <div>
                <p className="font-bold text-slate-800 dark:text-white">{row.description || row.key}</p>
                <p className="text-xs font-mono text-slate-400">{row.key}</p>
              </div>
              <span className="px-3 py-1 rounded-lg bg-slate-100 dark:bg-[#183025] font-mono text-xs">
                {row.value || '(ยังไม่กำหนด)'}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
