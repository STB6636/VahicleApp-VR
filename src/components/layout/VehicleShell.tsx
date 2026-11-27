import { useState, useMemo, useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuthStore, isVehicleSuperAdmin } from '@/stores/useAuthStore';
import { signOutVehicleApp } from '@/services/ssoAuthService';
import { PORTAL_HOME_URL } from '@/lib/portalClient';
import { getCurrentYearBeBangkok } from '@/lib/thaiDate';
import { useUiStore } from '@/stores/useUiStore';
import { NotificationBell } from '@/components/common/NotificationBell';

interface NavItemDef {
  id: string;
  to: string;
  label: string;
  shortLabel: string;
  icon: string;
  iconBg: string;
  group: string;
  show: boolean;
}

const ROUTE_META: Record<string, { title: string; subtitle: string; activeId: string }> = {
  '/dashboard': {
    activeId: 'dashboard',
    title: 'ภาพรวมสถานะยานพาหนะ',
    subtitle: 'สรุปสถานะการต่อภาษี ใบอนุญาตเรือ และรายการที่ต้องติดตาม',
  },
  '/vehicles': {
    activeId: 'vehicles',
    title: 'ทะเบียนยานพาหนะราชการ',
    subtitle: 'ข้อมูลรถยนต์ รถจักรยานยนต์ รถบรรทุก และเรือราชการ พร้อมผู้ดูแล',
  },
  '/activities': {
    activeId: 'activities',
    title: 'บันทึกข้อมูลและประวัติกิจกรรม',
    subtitle: 'บันทึกต่ออายุภาษี ใบอนุญาตเรือ แจ้งซ่อมบำรุง ยุบสภาพ และจำหน่าย',
  },
  '/reports': {
    activeId: 'reports',
    title: 'พิมพ์รายงานยานพาหนะ',
    subtitle: 'รายงานรถและเรือราชการแบบจัดกลุ่มตามส่วนราชการ ประเภท และสถานะ',
  },
  '/settings': {
    activeId: 'settings',
    title: 'ตั้งค่าระบบยานพาหนะ',
    subtitle: 'กำหนดวันแจ้งเตือน พารามิเตอร์ Google Drive และตรวจสอบสุขภาพ Schema vehicleapp',
  },
};

export function VehicleShell() {
  const { isDark, toggleTheme } = useTheme();
  const user = useAuthStore((s) => s.user);
  const personnel = useAuthStore((s) => s.personnel);
  const appPermission = useAuthStore((s) => s.appPermission);
  const showToast = useUiStore((s) => s.showToast);
  const location = useLocation();
  const navigate = useNavigate();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isSuper = isVehicleSuperAdmin(user, appPermission);
  const meta = ROUTE_META[location.pathname] ?? ROUTE_META['/dashboard'];

  useEffect(() => {
    document.title = `${meta.title} — ระบบยานพาหนะราชการ`;
  }, [meta.title]);

  const navItems = useMemo<NavItemDef[]>(
    () =>
      [
        {
          id: 'dashboard',
          group: 'หลัก',
          to: '/dashboard',
          label: 'ภาพรวม (Dashboard)',
          shortLabel: 'ภาพรวม',
          icon: 'fa-chart-pie',
          iconBg: 'bg-emerald-500/15 text-emerald-400',
          show: true,
        },
        {
          id: 'vehicles',
          group: 'งานยานพาหนะ',
          to: '/vehicles',
          label: 'ทะเบียนยานพาหนะ',
          shortLabel: 'ยานพาหนะ',
          icon: 'fa-car-side',
          iconBg: 'bg-teal-500/15 text-teal-400',
          show: true,
        },
        {
          id: 'activities',
          group: 'งานยานพาหนะ',
          to: '/activities',
          label: 'บันทึกต่อภาษี / ซ่อมบำรุง',
          shortLabel: 'บันทึกงาน',
          icon: 'fa-clipboard-check',
          iconBg: 'bg-amber-500/15 text-amber-400',
          show: true,
        },
        {
          id: 'reports',
          group: 'รายงานและตั้งค่า',
          to: '/reports',
          label: 'พิมพ์รายงาน',
          shortLabel: 'รายงาน',
          icon: 'fa-file-pdf',
          iconBg: 'bg-sky-500/15 text-sky-400',
          show: true,
        },
        {
          id: 'settings',
          group: 'รายงานและตั้งค่า',
          to: '/settings',
          label: 'ตั้งค่าระบบ',
          shortLabel: 'ตั้งค่า',
          icon: 'fa-gears',
          iconBg: 'bg-rose-500/15 text-rose-400',
          show: isSuper,
        },
      ].filter((item) => item.show),
    [isSuper]
  );

  const groupedNav = useMemo(() => {
    const groups: Array<{ group: string; items: NavItemDef[] }> = [];
    for (const item of navItems) {
      let bucket = groups.find((g) => g.group === item.group);
      if (!bucket) {
        bucket = { group: item.group, items: [] };
        groups.push(bucket);
      }
      bucket.items.push(item);
    }
    return groups;
  }, [navItems]);

  const displayName = personnel?.full_name || user?.username || 'ผู้ใช้งาน';
  const initials = displayName.trim().slice(0, 2);
  const roleLabel = appPermission?.role_name_th || user?.role || 'USER';
  const orgLabel = personnel?.department_name || personnel?.office_name || 'Portal SSO-VR';
  const yearBuddhist = getCurrentYearBeBangkok();

  const handleSignOut = async () => {
    await signOutVehicleApp();
    showToast('ออกจากระบบยานพาหนะแล้ว', 'info');
    navigate('/portal-required', { replace: true });
  };

  const renderSidebar = () => (
    <div className="flex flex-col h-full bg-[#111827] dark:bg-[#0B132B] text-slate-100 border-r border-slate-800/80">
      <div className="px-4 py-4 border-b border-slate-800 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-600/25 border border-emerald-400/30 flex items-center justify-center shrink-0">
          <i className="fa-solid fa-car-rear text-emerald-300 text-lg" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold text-emerald-400 truncate">สำนักเทศกิจ กทม.</p>
          <p className="font-extrabold text-sm text-white truncate">ระบบยานพาหนะราชการ</p>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="ปิดเมนู"
          className="lg:hidden w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center"
        >
          <i className="fa-solid fa-xmark" />
        </button>
      </div>

      {/* Capsule User Profile Card */}
      <div className="px-3.5 py-3 border-b border-slate-800/80">
        <div className="p-2.5 rounded-2xl bg-slate-800/70 border border-slate-700/70 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-700 text-white font-extrabold text-xs flex items-center justify-center shrink-0 shadow-md border border-white/20">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-xs text-white truncate">{displayName}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-400/20 text-emerald-300 border border-emerald-400/30 truncate">
                {roleLabel}
              </span>
              <span className="text-[10px] text-slate-400 truncate" title={orgLabel}>
                {orgLabel}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Grouped Navigation */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-3">
        {groupedNav.map((grp) => (
          <div key={grp.group} className="space-y-1">
            <p className="px-3 pt-1 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {grp.group}
            </p>
            {grp.items.map((item) => (
              <NavLink
                key={item.id}
                to={item.to}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold transition ${
                    isActive || meta.activeId === item.id
                      ? 'bg-gradient-to-r from-[#00744B] to-[#00A368] text-white shadow-md shadow-emerald-950/60'
                      : 'text-slate-300 hover:bg-white/6 hover:text-white'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs shrink-0 ${
                        isActive || meta.activeId === item.id ? 'bg-white/20 text-white' : item.iconBg
                      }`}
                    >
                      <i className={`fa-solid ${item.icon}`} />
                    </span>
                    <span className="flex-1 truncate">{item.label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Sidebar Footer */}
      <div className="p-3 border-t border-slate-800 space-y-2">
        {PORTAL_HOME_URL && (
          <a
            href={PORTAL_HOME_URL}
            className="w-full px-3 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-xs font-bold text-emerald-300 flex items-center justify-center gap-2 transition"
          >
            <i className="fa-solid fa-arrow-left" />
            <span>กลับ Portal SSO-VR</span>
          </a>
        )}
        <button
          type="button"
          onClick={() => void handleSignOut()}
          className="w-full px-3 py-2 rounded-xl bg-white/5 hover:bg-rose-500/20 text-xs font-bold text-slate-300 hover:text-rose-200 flex items-center justify-center gap-2 transition"
        >
          <i className="fa-solid fa-right-from-bracket" />
          <span>ออกจากระบบ</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-[#E7ECE9] dark:bg-[#0B132B] text-slate-800 dark:text-slate-100 print:bg-white print:text-black">
      <aside className="hidden lg:block w-72 shrink-0 sticky top-0 h-screen shadow-xl z-30 print:hidden">
        {renderSidebar()}
      </aside>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[9980] lg:hidden flex print:hidden">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-72 max-w-[85vw] h-full shadow-2xl z-10">{renderSidebar()}</div>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col min-h-screen pb-16 lg:pb-0 print:pb-0">
        <header className="sticky top-0 z-20 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 px-4 sm:px-6 py-3 flex items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="เปิดเมนู"
            >
              <i className="fa-solid fa-bars-staggered" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <button
                  type="button"
                  onClick={() => navigate('/dashboard')}
                  className="hover:text-emerald-600 transition"
                  title="หน้าหลัก"
                >
                  <i className="fa-solid fa-house" />
                </button>
                <span>/</span>
                <span className="text-emerald-700 dark:text-emerald-400 font-bold truncate">
                  {meta.title}
                </span>
              </div>
              <h1 className="text-base sm:text-lg font-extrabold text-slate-800 dark:text-white truncate leading-tight">
                {meta.title}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate hidden sm:block">
                {meta.subtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-[11px] font-bold text-[#00744B] dark:text-emerald-300">
              <i className="fa-solid fa-shield-halved text-[10px]" />
              <span>SSO Verified</span>
            </span>
            <NotificationBell />
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-amber-300 transition"
            >
              <i className={`fa-solid ${isDark ? 'fa-sun' : 'fa-moon'}`} />
              <span className="hidden sm:inline">{isDark ? 'โหมดสว่าง' : 'โหมดถนอมสายตา'}</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-[1600px] w-full mx-auto print:p-0 print:max-w-none">
          <Outlet />
        </main>

        <footer className="px-6 py-3 text-center text-xs text-slate-500 dark:text-slate-400 border-t border-slate-200/70 dark:border-slate-800/80 print:hidden">
          ระบบต่อภาษีและใบอนุญาตยานพาหนะราชการ (Schema: <code>vehicleapp</code>) · เชื่อมต่อ Portal SSO-VR · พ.ศ. {yearBuddhist}
        </footer>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 px-2 py-1.5 flex items-center justify-around print:hidden">
        {navItems.slice(0, 5).map((item) => (
          <NavLink
            key={item.id}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl text-[10px] font-bold transition ${
                isActive ? 'text-[#00744B] dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'
              }`
            }
          >
            <i className={`fa-solid ${item.icon} text-sm`} />
            <span>{item.shortLabel}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
