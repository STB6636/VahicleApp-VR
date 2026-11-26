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
  return user?.role === 'SUPERADMIN' || (perm?.hierarchy_level ?? 0) >= 90;
}

export function isVehicleAdminOrAbove(user: PortalSsoUser | null, perm: PortalAppPermission | null): boolean {
  return (
    user?.role === 'SUPERADMIN' ||
    user?.role === 'ADMIN' ||
    (perm?.hierarchy_level ?? 0) >= 50
  );
}
