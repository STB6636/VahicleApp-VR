import { describe, it, expect, beforeEach } from 'vitest';
import { extractSsoTokenFromLocation } from '@/lib/portalClient';
import {
  PORTAL_HANDSHAKE_SESSION_KEY,
  hasPortalHandshakeFlag,
  markPortalHandshakeFlag,
  useAuthStore,
  isVehicleAdminOrAbove,
  isVehicleSuperAdmin,
} from '@/stores/useAuthStore';
import { verifyExistingPortalSession } from '@/services/ssoAuthService';

describe('Portal-Only Entry Security (Requirement 8)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    useAuthStore.setState({
      hydrated: false,
      ssoVerified: false,
      user: null,
      personnel: null,
      appPermission: null,
      blockReason: null,
      blockMessage: null,
    });
  });

  it('extracts sso_token from both BrowserRouter search and HashRouter hash URLs', () => {
    expect(extractSsoTokenFromLocation('?sso_token=abc123', '')).toBe('abc123');
    expect(extractSsoTokenFromLocation('', '#/sso-callback?sso_token=xyz789&foo=1')).toBe('xyz789');
    expect(extractSsoTokenFromLocation('', '#/dashboard')).toBe('');
    expect(extractSsoTokenFromLocation('?sso_token=%20%20', '')).toBe('');
  });

  it('blocks direct URL access when sessionStorage handshake flag is missing', async () => {
    expect(hasPortalHandshakeFlag()).toBe(false);
    const allowed = await verifyExistingPortalSession();
    expect(allowed).toBe(false);

    const state = useAuthStore.getState();
    expect(state.hydrated).toBe(true);
    expect(state.ssoVerified).toBe(false);
    expect(state.blockReason).toBe('DIRECT_ACCESS_BLOCKED');
  });

  it('persists handshake flag strictly in sessionStorage (not localStorage)', () => {
    const localWrites: string[] = [];
    const mockLocalStorage = {
      getItem: () => null,
      setItem: (key: string) => {
        localWrites.push(key);
      },
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    };
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: mockLocalStorage,
    });

    markPortalHandshakeFlag(true);
    expect(window.sessionStorage.getItem(PORTAL_HANDSHAKE_SESSION_KEY)).toBe('1');
    expect(localWrites).toHaveLength(0);

    useAuthStore.getState().clearAuth('SIGNED_OUT');
    expect(window.sessionStorage.getItem(PORTAL_HANDSHAKE_SESSION_KEY)).toBeNull();
  });

  it('evaluates role hierarchy accurately for SUPERADMIN, ADMIN, and app hierarchy_level', () => {
    expect(
      isVehicleSuperAdmin(
        { id: '1', username: 'sa', email: null, role: 'SUPERADMIN' },
        null
      )
    ).toBe(true);

    expect(
      isVehicleSuperAdmin(
        { id: '2', username: 'u', email: null, role: 'USER' },
        { role_code: 'APP_ADMIN', role_name_th: 'ผู้ดูแลระบบ', hierarchy_level: 90 }
      )
    ).toBe(true);

    expect(
      isVehicleAdminOrAbove(
        { id: '3', username: 'u', email: null, role: 'USER' },
        { role_code: 'FLEET_ADMIN', role_name_th: 'เจ้าหน้าที่ยานพาหนะ', hierarchy_level: 50 }
      )
    ).toBe(true);

    expect(
      isVehicleAdminOrAbove(
        { id: '4', username: 'u', email: null, role: 'USER' },
        { role_code: 'DEPT_OFFICER', role_name_th: 'ผู้ใช้งานฝ่าย', hierarchy_level: 10 }
      )
    ).toBe(false);
  });
});
