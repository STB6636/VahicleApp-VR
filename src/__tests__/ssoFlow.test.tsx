import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { PortalOnlyGuard } from '@/components/auth/PortalOnlyGuard';
import { SsoCallbackPage } from '@/pages/SsoCallbackPage';
import { PortalAccessBlockedPage } from '@/pages/PortalAccessBlockedPage';
import { useAuthStore, PORTAL_HANDSHAKE_SESSION_KEY } from '@/stores/useAuthStore';
import * as ssoAuthService from '@/services/ssoAuthService';

async function flushPromises(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('PortalOnlyGuard & SsoCallbackPage React Flow (Requirement 8)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState({}, '', '/');
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
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  function cleanup() {
    act(() => {
      root.unmount();
    });
    container.remove();
  }

  it('redirects direct /vehicles access to /portal-required without rendering protected content', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/vehicles']}>
          <Routes>
            <Route path="/portal-required" element={<PortalAccessBlockedPage />} />
            <Route
              path="/vehicles"
              element={
                <PortalOnlyGuard>
                  <div>SECRET_VEHICLES_TABLE</div>
                </PortalOnlyGuard>
              }
            />
          </Routes>
        </MemoryRouter>
      );
    });
    await flushPromises();

    expect(container.textContent).not.toContain('SECRET_VEHICLES_TABLE');
    expect(container.textContent).toContain('ต้องเข้าใช้งานผ่าน Portal SSO-VR เท่านั้น');
    cleanup();
  });

  it('strips sso_token from window URL on FAILED SSO exchange and navigates to /portal-required', async () => {
    window.history.replaceState({}, '', '/?sso_token=EXPIRED_TOKEN#/sso-callback?sso_token=EXPIRED_TOKEN');
    vi.spyOn(ssoAuthService, 'exchangeSsoTokenAndSignIn').mockRejectedValueOnce(
      new Error('SSO Token หมดอายุ')
    );

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/sso-callback?sso_token=EXPIRED_TOKEN']}>
          <Routes>
            <Route path="/sso-callback" element={<SsoCallbackPage />} />
            <Route path="/portal-required" element={<PortalAccessBlockedPage />} />
            <Route path="/dashboard" element={<div>DASHBOARD_OK</div>} />
          </Routes>
        </MemoryRouter>
      );
    });
    await flushPromises();

    expect(window.location.search).toBe('');
    expect(window.location.hash).not.toContain('sso_token');
    expect(container.textContent).toContain('การยืนยันตัวตน SSO ไม่สำเร็จ');
    expect(useAuthStore.getState().blockReason).toBe('SSO_EXCHANGE_FAILED');
    cleanup();
  });

  it('strips sso_token from window URL on SUCCESSFUL SSO exchange and navigates to /dashboard', async () => {
    window.history.replaceState({}, '', '/?sso_token=VALID_TOKEN#/sso-callback?sso_token=VALID_TOKEN');
    vi.spyOn(ssoAuthService, 'exchangeSsoTokenAndSignIn').mockImplementationOnce(async () => {
      useAuthStore.getState().setSession({
        user: { id: 'u-1', username: 'officer1', email: null, role: 'USER' },
        personnel: { id: 'p-1', full_name: 'นายทดสอบ ระบบ' },
        appPermission: { role_code: 'DEPT_OFFICER', role_name_th: 'ผู้ใช้งานฝ่าย', hierarchy_level: 10 },
      });
      return {
        success: true,
        user: { id: 'u-1', username: 'officer1', email: null, role: 'USER' },
        personnel: { id: 'p-1', full_name: 'นายทดสอบ ระบบ' },
        app_permission: { role_code: 'DEPT_OFFICER', role_name_th: 'ผู้ใช้งานฝ่าย', hierarchy_level: 10 },
        otp_hash: 'hash-123',
      };
    });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/sso-callback?sso_token=VALID_TOKEN']}>
          <Routes>
            <Route path="/sso-callback" element={<SsoCallbackPage />} />
            <Route path="/portal-required" element={<PortalAccessBlockedPage />} />
            <Route path="/dashboard" element={<div>DASHBOARD_OK</div>} />
          </Routes>
        </MemoryRouter>
      );
    });
    await flushPromises();

    expect(window.location.search).toBe('');
    expect(window.location.hash).not.toContain('sso_token');
    expect(window.sessionStorage.getItem(PORTAL_HANDSHAKE_SESSION_KEY)).toBe('1');
    expect(container.textContent).toContain('DASHBOARD_OK');
    cleanup();
  });
});
