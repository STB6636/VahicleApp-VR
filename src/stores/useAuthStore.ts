import { create } from 'zustand';
import type {
  PortalAppPermission,
  PortalPersonnelSummary,
  PortalSsoUser,
} from '@/types/sso.types';

export const PORTAL_HANDSHAKE_SESSION_KEY = 'vehicleapp_portal_sso_verified';

export type PortalBlockReason =
  | 'DIRECT_ACCESS_BLOCKED'
  | 'SESSION_EXPIRED'
  | 'NO_APP_PERMISSION'
  | 'USER_ROLE_NOT_SUPPORTED'
  | 'SSO_EXCHANGE_FAILED'
  | 'SIGNED_OUT';

export interface AuthState {
  hydrated: boolean;
  ssoVerified: boolean;
  user: PortalSsoUser | null;
  personnel: PortalPersonnelSummary | null;
  appPermission: PortalAppPermission | null;
  blockReason: PortalBlockReason | null;
  blockMessage: string | null;

  setSession: (payload: {
    user: PortalSsoUser;
    personnel: PortalPersonnelSummary | null;
    appPermission: PortalAppPermission | null;
  }) => void;
  setBlocked: (reason: PortalBlockReason, message?: string) => void;
  setHydrated: (hydrated: boolean) => void;
  clearAuth: (reason?: PortalBlockReason, message?: string) => void;
}

export function hasPortalHandshakeFlag(): boolean {
  try {
    return typeof window !== 'undefined' && window.sessionStorage.getItem(PORTAL_HANDSHAKE_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

export function markPortalHandshakeFlag(active: boolean): void {
  try {
    if (typeof window === 'undefined') return;
    if (active) {
      window.sessionStorage.setItem(PORTAL_HANDSHAKE_SESSION_KEY, '1');
    } else {
      window.sessionStorage.removeItem(PORTAL_HANDSHAKE_SESSION_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  hydrated: false,
  ssoVerified: false,
  user: null,
  personnel: null,
  appPermission: null,
  blockReason: null,
  blockMessage: null,

  setSession: ({ user, personnel, appPermission }) => {
    markPortalHandshakeFlag(true);
    set({
      hydrated: true,
      ssoVerified: true,
      user,
      personnel,
      appPermission,
      blockReason: null,
      blockMessage: null,
    });
  },

  setBlocked: (reason, message) => {
    markPortalHandshakeFlag(false);
    set({
      hydrated: true,
      ssoVerified: false,
      user: null,
      personnel: null,
      appPermission: null,
      blockReason: reason,
      blockMessage: message ?? null,
    });
  },

  setHydrated: (hydrated) => set({ hydrated }),

  clearAuth: (reason = 'SIGNED_OUT', message) => {
    markPortalHandshakeFlag(false);
    set({
      hydrated: true,
      ssoVerified: false,
      user: null,
      personnel: null,
      appPermission: null,
      blockReason: reason,
      blockMessage: message ?? null,
    });
  },
}));

export function isVehicleSuperAdmin(user: PortalSsoUser | null, perm: PortalAppPermission | null): boolean {
  const code = String(perm?.role_code || '').toUpperCase();
  return (
    user?.role === 'SUPERADMIN' ||
    (perm?.hierarchy_level ?? 0) >= 90 ||
    code === 'SUPERADMIN' ||
    code === 'APP_ADMIN'
  );
}

export function isVehicleAdminOrAbove(user: PortalSsoUser | null, perm: PortalAppPermission | null): boolean {
  const code = String(perm?.role_code || '').toUpperCase();
  return (
    isVehicleSuperAdmin(user, perm) ||
    user?.role === 'ADMIN' ||
    (perm?.hierarchy_level ?? 0) >= 50 ||
    code === 'ADMIN' ||
    code === 'FLEET_ADMIN'
  );
}

export function getVehicleRoleLabel(user: PortalSsoUser | null, perm: PortalAppPermission | null): string {
  if (isVehicleSuperAdmin(user, perm)) return 'SuperAdmin';
  if (isVehicleAdminOrAbove(user, perm)) {
    if (user?.admin_scope?.scope_level_no === 2) return 'Admin (สำนักงาน/กอง)';
    if (user?.admin_scope?.scope_level_no === 3) return 'Admin (ส่วน/ฝ่าย)';
    return 'Admin';
  }
  return 'User';
}

export function getAdminScopeSummary(
  user: PortalSsoUser | null,
  perm: PortalAppPermission | null,
  fallbackOrgName?: string | null
): { levelLabel: string; orgName: string; isUnassignedAdmin: boolean } {
  if (isVehicleSuperAdmin(user, perm)) {
    return { levelLabel: 'มุมมองทุกส่วนราชการ', orgName: 'ทั้งหน่วยงาน', isUnassignedAdmin: false };
  }
  if (user?.role === 'ADMIN') {
    if (user.admin_scope) {
      const levelLabel =
        user.admin_scope.scope_level_no === 2 ? 'มุมมองสำนักงาน/กอง (Lv2)' : 'มุมมองส่วน/ฝ่าย (Lv3)';
      const orgName = user.admin_scope.org_unit_name || fallbackOrgName || 'ตามขอบเขตที่ได้รับมอบหมาย';
      return { levelLabel, orgName, isUnassignedAdmin: false };
    }
    return {
      levelLabel: 'ยังไม่ได้กำหนดขอบเขต Admin',
      orgName: 'กรุณาติดต่อผู้ดูแลระบบ Portal SSO เพื่อกำหนดขอบเขตสังกัด',
      isUnassignedAdmin: true,
    };
  }
  return {
    levelLabel: 'มุมมองส่วน/ฝ่าย',
    orgName: fallbackOrgName || 'สังกัดของท่าน',
    isUnassignedAdmin: false,
  };
}
