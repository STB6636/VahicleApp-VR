import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore, isVehicleAdminOrAbove, isVehicleSuperAdmin } from '@/stores/useAuthStore';
import { verifyExistingPortalSession } from '@/services/ssoAuthService';
import { extractSsoTokenFromLocation } from '@/lib/portalClient';

interface PortalOnlyGuardProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  requireSuperAdmin?: boolean;
}

/**
 * Strict Portal-Only Entry Guard (Requirement 8):
 * - Blocks ALL direct URL access without a verified Portal SSO handshake session.
 * - If a `?sso_token=...` is present on any route, forwards immediately to `/sso-callback`.
 * - Never displays a standalone login form; redirects unauthorized visitors to `/portal-required`.
 */
export function PortalOnlyGuard({
  children,
  requireAdmin = false,
  requireSuperAdmin = false,
}: PortalOnlyGuardProps) {
  const location = useLocation();
  const hydrated = useAuthStore((s) => s.hydrated);
  const ssoVerified = useAuthStore((s) => s.ssoVerified);
  const user = useAuthStore((s) => s.user);
  const appPermission = useAuthStore((s) => s.appPermission);

  const incomingToken = extractSsoTokenFromLocation(
    typeof window !== 'undefined' ? window.location.search : location.search,
    typeof window !== 'undefined' ? window.location.hash : location.hash
  );

  useEffect(() => {
    if (!hydrated && !incomingToken) {
      void verifyExistingPortalSession();
    }
  }, [hydrated, incomingToken]);

  if (incomingToken) {
    return <Navigate to={`/sso-callback?sso_token=${encodeURIComponent(incomingToken)}`} replace />;
  }

  if (!hydrated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#E7ECE9] dark:bg-[#0B132B] text-slate-700 dark:text-slate-200 px-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#005B2E] to-[#00A368] text-white flex items-center justify-center shadow-lg mb-4 animate-pulse">
          <i className="fa-solid fa-shield-halved text-2xl text-[#F6DE51]" />
        </div>
        <p className="font-bold text-base">กำลังตรวจสอบสิทธิ์จาก Portal SSO-VR...</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          ระบบตรวจสอบการยืนยันตัวตนแบบ Single Sign-On
        </p>
      </div>
    );
  }

  if (!ssoVerified || !user) {
    return <Navigate to="/portal-required" replace />;
  }

  if (requireSuperAdmin && !isVehicleSuperAdmin(user, appPermission)) {
    return <Navigate to="/dashboard" replace />;
  }

  if (requireAdmin && !isVehicleAdminOrAbove(user, appPermission)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
