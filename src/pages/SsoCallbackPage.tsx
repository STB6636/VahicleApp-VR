import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { extractSsoTokenFromLocation, stripSsoTokenFromUrl } from '@/lib/portalClient';
import { exchangeSsoTokenAndSignIn, PortalAuthBlockedError } from '@/services/ssoAuthService';
import { useAuthStore } from '@/stores/useAuthStore';

function clearSsoTokenFromBrowserUrl(): void {
  try {
    const cleanUrl = stripSsoTokenFromUrl(window.location.href);
    window.history.replaceState({}, document.title, cleanUrl);
  } catch {
    // ignore history errors
  }
}

export function SsoCallbackPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const executedRef = useRef(false);
  const [statusMessage, setStatusMessage] = useState('กำลังยืนยันตัวตนกับ Portal SSO-VR...');

  useEffect(() => {
    if (executedRef.current) return;
    executedRef.current = true;

    const ssoToken = extractSsoTokenFromLocation(
      window.location.search || location.search,
      window.location.hash || location.hash
    );

    if (!ssoToken) {
      clearSsoTokenFromBrowserUrl();
      useAuthStore
        .getState()
        .setBlocked('DIRECT_ACCESS_BLOCKED', 'ไม่พบ SSO Token กรุณาเปิดระบบผ่าน Portal SSO-VR เท่านั้น');
      navigate('/portal-required', { replace: true });
      return;
    }

    // Immediately strip one-time sso_token from browser URL bar before network I/O
    // so neither success nor failure can leak the token or trigger a HashRouter loop.
    clearSsoTokenFromBrowserUrl();

    (async () => {
      try {
        setStatusMessage('กำลังแลก One-Time SSO Token และสร้างเซสชัน...');
        await exchangeSsoTokenAndSignIn(ssoToken);
        navigate('/dashboard', { replace: true });
      } catch (err) {
        if (err instanceof PortalAuthBlockedError) {
          useAuthStore.getState().setBlocked(err.reason, err.message);
        } else {
          const msg = err instanceof Error ? err.message : 'ไม่สามารถยืนยันตัวตนจาก Portal SSO-VR ได้';
          useAuthStore.getState().setBlocked('SSO_EXCHANGE_FAILED', msg);
        }
        navigate('/portal-required', { replace: true });
      }
    })();
  }, [location.hash, location.search, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#00351B] via-[#005B2E] to-[#00744B] px-4">
      <div className="w-full max-w-md rounded-3xl bg-white/95 dark:bg-slate-900/95 p-8 text-center shadow-2xl border border-emerald-500/30">
        <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-[#005B2E] to-[#00A368] text-[#F6DE51] flex items-center justify-center shadow-lg">
          <i className="fa-solid fa-circle-notch fa-spin text-2xl" />
        </div>
        <h1 className="text-lg font-extrabold text-slate-800 dark:text-white">
          กำลังเชื่อมต่อ Portal SSO-VR
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">{statusMessage}</p>
        <p className="text-xs text-slate-400 mt-4">
          ระบบต่อภาษีและใบอนุญาตยานพาหนะราชการ
        </p>
      </div>
    </div>
  );
}
