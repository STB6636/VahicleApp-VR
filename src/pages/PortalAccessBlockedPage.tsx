import { useAuthStore } from '@/stores/useAuthStore';
import { PORTAL_HOME_URL } from '@/lib/portalClient';

export function PortalAccessBlockedPage() {
  const blockReason = useAuthStore((s) => s.blockReason);
  const blockMessage = useAuthStore((s) => s.blockMessage);

  const titleByReason: Record<string, string> = {
    DIRECT_ACCESS_BLOCKED: 'ต้องเข้าใช้งานผ่าน Portal SSO-VR เท่านั้น',
    SESSION_EXPIRED: 'เซสชันการเชื่อมต่อหมดอายุ',
    NO_APP_PERMISSION: 'ไม่มีสิทธิ์เข้าใช้งานระบบนี้',
    USER_ROLE_NOT_SUPPORTED: 'ยังไม่เปิดให้สิทธิ์ระดับผู้ใช้งานทั่วไป (User) เข้าใช้งาน',
    SSO_EXCHANGE_FAILED: 'การยืนยันตัวตน SSO ไม่สำเร็จ',
    SIGNED_OUT: 'ออกจากระบบเรียบร้อยแล้ว',
  };

  const title = titleByReason[blockReason ?? 'DIRECT_ACCESS_BLOCKED'] ?? titleByReason.DIRECT_ACCESS_BLOCKED;
  const description =
    blockMessage ||
    'ระบบนี้เชื่อมต่อการยืนยันตัวตนแบบ Single Sign-On กับ Portal SSO-VR และไม่อนุญาตให้เข้าผ่านลิงก์โดยตรง กรุณาเปิดใช้งานผ่านหน้า Portal ส่วนกลาง';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#00351B] via-[#005B2E] to-[#00744B] px-4 py-10">
      <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 shadow-2xl border border-emerald-500/25 overflow-hidden">
        <div className="bg-gradient-to-r from-[#00351B] via-[#005B2E] to-[#00744B] border-b-[3px] border-[#F6DE51] px-6 py-7 text-center text-white">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/15 border border-[#F6DE51]/50 flex items-center justify-center shadow-lg">
            <i className="fa-solid fa-lock text-2xl text-[#F6DE51]" />
          </div>
          <p className="text-xs font-bold tracking-wider text-emerald-200 uppercase">
            Portal-Only Access Policy
          </p>
          <h1 className="text-xl font-extrabold mt-1">
            ระบบต่อภาษีและใบอนุญาตยานพาหนะราชการ
          </h1>
        </div>

        <div className="p-6 sm:p-7 text-center space-y-5">
          <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-800/60 p-4 text-left">
            <div className="flex items-start gap-3">
              <i className="fa-solid fa-shield-halved text-amber-600 dark:text-amber-400 mt-0.5 text-lg" />
              <div>
                <h2 className="font-extrabold text-sm text-slate-800 dark:text-white">{title}</h2>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                  {description}
                </p>
              </div>
            </div>
          </div>

          {PORTAL_HOME_URL ? (
            <a
              href={PORTAL_HOME_URL}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-[#00744B] to-[#00A368] hover:from-[#005B2E] hover:to-[#00744B] text-white font-bold text-sm shadow-lg shadow-emerald-900/25 transition"
            >
              <i className="fa-solid fa-arrow-up-right-from-square" />
              <span>ไปยังหน้าเข้าสู่ระบบ Portal SSO-VR</span>
            </a>
          ) : (
            <div className="rounded-xl bg-slate-100 dark:bg-slate-800 p-3 text-xs text-slate-500 dark:text-slate-400">
              กรุณาตั้งค่า <code>VITE_PORTAL_URL</code> ใน <code>.env.local</code> หรือปิดหน้าต่างนี้แล้วเปิดใหม่จาก Portal SSO-VR
            </div>
          )}

          <p className="text-[11px] text-slate-400">
            สำนักเทศกิจ กรุงเทพมหานคร · มาตรฐานความปลอดภัย Portal SSO-VR
          </p>
        </div>
      </div>
    </div>
  );
}
