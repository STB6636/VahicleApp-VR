import { describe, it, expect, beforeEach, vi } from 'vitest';
import { extractSsoTokenFromLocation, stripSsoTokenFromUrl } from '@/lib/portalClient';
import {
  PORTAL_HANDSHAKE_SESSION_KEY,
  hasPortalHandshakeFlag,
  markPortalHandshakeFlag,
  useAuthStore,
  isVehicleAdminOrAbove,
  isVehicleSuperAdmin,
} from '@/stores/useAuthStore';
import { verifyExistingPortalSession } from '@/services/ssoAuthService';
import fs from 'node:fs';
import path from 'node:path';

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
    vi.restoreAllMocks();
  });

  it('extracts sso_token from both BrowserRouter search and HashRouter hash URLs', () => {
    expect(extractSsoTokenFromLocation('?sso_token=abc123', '')).toBe('abc123');
    expect(extractSsoTokenFromLocation('', '#/sso-callback?sso_token=xyz789&foo=1')).toBe('xyz789');
    expect(extractSsoTokenFromLocation('', '#/dashboard')).toBe('');
    expect(extractSsoTokenFromLocation('?sso_token=%20%20', '')).toBe('');
  });

  it('strips sso_token from both search and hash queries while preserving unrelated params', () => {
    expect(stripSsoTokenFromUrl('https://app.example.com/sso-callback?sso_token=secret&tab=1')).toBe(
      '/sso-callback?tab=1'
    );
    expect(
      stripSsoTokenFromUrl('https://stb6636.github.io/VahicleApp-VR/?sso_token=secret#/sso-callback?sso_token=secret')
    ).toBe('/VahicleApp-VR/#/sso-callback');
    expect(
      stripSsoTokenFromUrl('https://stb6636.github.io/VahicleApp-VR/#/sso-callback?sso_token=secret&mode=test')
    ).toBe('/VahicleApp-VR/#/sso-callback?mode=test');
    expect(stripSsoTokenFromUrl('https://app.example.com/dashboard')).toBe('/dashboard');
  });

  it('404.html redirect preserves subpath and sso_token on both GitHub Pages and root domains', () => {
    const html = fs.readFileSync(path.resolve(process.cwd(), 'public/404.html'), 'utf8');
    const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
    expect(scriptMatch).toBeTruthy();

    const runner = new Function('window', scriptMatch![1]);

    // 1. GitHub Pages subpath (/VahicleApp-VR/sso-callback)
    let ghRedirect = '';
    runner({
      location: {
        protocol: 'https:',
        host: 'stb6636.github.io',
        hostname: 'stb6636.github.io',
        pathname: '/VahicleApp-VR/sso-callback',
        search: '?sso_token=ONE_TIME_TOK',
        replace: (target: string) => {
          ghRedirect = target;
        },
      },
    });
    expect(ghRedirect).toBe('https://stb6636.github.io/VahicleApp-VR/#/sso-callback?sso_token=ONE_TIME_TOK');
    const ghParsed = new URL(ghRedirect);
    expect(extractSsoTokenFromLocation(ghParsed.search, ghParsed.hash)).toBe('ONE_TIME_TOK');

    // 2. Root-hosted domain (Cloudflare Pages: vehicle-stb.pages.dev/sso-callback) must NOT loop on /sso-callback/#/
    let cfRedirect = '';
    runner({
      location: {
        protocol: 'https:',
        host: 'vehicle-stb.pages.dev',
        hostname: 'vehicle-stb.pages.dev',
        pathname: '/sso-callback',
        search: '?sso_token=CF_TOK_999',
        replace: (target: string) => {
          cfRedirect = target;
        },
      },
    });
    expect(cfRedirect).toBe('https://vehicle-stb.pages.dev/#/sso-callback?sso_token=CF_TOK_999');
    const cfParsed = new URL(cfRedirect);
    expect(extractSsoTokenFromLocation(cfParsed.search, cfParsed.hash)).toBe('CF_TOK_999');
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
