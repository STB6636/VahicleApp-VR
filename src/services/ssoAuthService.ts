import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient';
import { createPortalClient } from '@/lib/portalClient';
import {
  hasPortalHandshakeFlag,
  markPortalHandshakeFlag,
  useAuthStore,
} from '@/stores/useAuthStore';
import type { PortalMeResponse, PortalSsoExchangeResponse } from '@/types/sso.types';

/**
 * Step 1 (Portal SSO Handshake):
 * Exchanges a one-time `sso_token` issued by Portal SSO-VR via `POST /portal-api/sso/exchange`,
 * verifies the returned `otp_hash` against shared Supabase Auth (persisted strictly in sessionStorage),
 * and establishes the active Portal SSO session in Zustand.
 */
export async function exchangeSsoTokenAndSignIn(ssoToken: string): Promise<PortalSsoExchangeResponse> {
  if (!isSupabaseConfigured) {
    throw new Error('ยังไม่ได้ตั้งค่าการเชื่อมต่อ Supabase (.env.local)');
  }

  const trimmed = ssoToken.trim();
  if (!trimmed) {
    throw new Error('ไม่พบ SSO Token จากระบบ Portal SSO-VR');
  }

  const portalClient = createPortalClient();
  const res = (await portalClient.exchangeSsoToken(trimmed)) as PortalSsoExchangeResponse;

  if (!res?.success || !res.otp_hash || !res.user) {
    throw new Error('ไม่สามารถยืนยันตัวตนจาก Portal SSO-VR ได้ (OTP ไม่สมบูรณ์)');
  }

  if (res.user.role !== 'SUPERADMIN' && !res.app_permission) {
    throw new Error('บัญชีของท่านไม่ได้รับสิทธิ์เข้าใช้งานระบบยานพาหนะราชการ');
  }

  const { error: otpError } = await supabase.auth.verifyOtp({
    token_hash: res.otp_hash,
    type: 'magiclink',
  });
  if (otpError) {
    throw new Error(`ไม่สามารถสร้างเซสชัน Supabase Auth ได้: ${otpError.message}`);
  }

  useAuthStore.getState().setSession({
    user: res.user,
    personnel: res.personnel ?? null,
    appPermission: res.app_permission ?? null,
  });

  return res;
}

/**
 * Step 2 (Tab-Refresh Verification & Direct-Link Blocking):
 * Called on app bootstrap when NOT arriving via `/sso-callback?sso_token=...`.
 * Enforces Requirement 8:
 *   1. Must have active `sessionStorage` Portal handshake flag (impossible on fresh direct link).
 *   2. Must have a valid Supabase session in `sessionStorage`.
 *   3. Server-side re-verification via `GET /portal-api/me` must confirm active VEHICLE_APP permission.
 */
export async function verifyExistingPortalSession(): Promise<boolean> {
  const store = useAuthStore.getState();

  if (!isSupabaseConfigured) {
    store.setBlocked('DIRECT_ACCESS_BLOCKED', 'กรุณาเข้าใช้งานผ่านระบบ Portal SSO-VR เท่านั้น');
    return false;
  }

  if (!hasPortalHandshakeFlag()) {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    store.setBlocked(
      'DIRECT_ACCESS_BLOCKED',
      'ไม่อนุญาตให้เข้าใช้งานผ่านลิงก์โดยตรง กรุณาเปิดระบบนี้ผ่าน Portal SSO-VR เท่านั้น'
    );
    return false;
  }

  const { data, error } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;

  if (error || !accessToken) {
    markPortalHandshakeFlag(false);
    store.setBlocked(
      'SESSION_EXPIRED',
      'เซสชันหมดอายุแล้ว กรุณากลับไปเปิดระบบใหม่อีกครั้งผ่าน Portal SSO-VR'
    );
    return false;
  }

  try {
    const portalClient = createPortalClient(accessToken);
    const me = (await portalClient.getMe()) as PortalMeResponse;

    if (!me?.success || !me.user) {
      throw new Error('ไม่สามารถตรวจสอบข้อมูลผู้ใช้งานจาก Portal SSO-VR ได้');
    }

    if (me.user.must_change_credential) {
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      store.setBlocked(
        'NO_APP_PERMISSION',
        'กรุณาเปลี่ยนรหัสผ่านเริ่มต้นใน Portal SSO-VR ก่อนเข้าใช้งานระบบนี้'
      );
      return false;
    }

    if (me.user.role !== 'SUPERADMIN' && !me.app_permission) {
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      store.setBlocked(
        'NO_APP_PERMISSION',
        'สิทธิ์การเข้าใช้งานระบบยานพาหนะราชการของท่านถูกระงับหรือหมดอายุแล้ว'
      );
      return false;
    }

    const prevUser = store.user;
    store.setSession({
      user: {
        ...me.user,
        username: me.user.username ?? prevUser?.username,
        email: me.user.email ?? prevUser?.email ?? me.personnel?.email ?? null,
      },
      personnel: me.personnel ?? null,
      appPermission: me.app_permission ?? null,
    });
    return true;
  } catch (err) {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    store.setBlocked(
      'SESSION_EXPIRED',
      err instanceof Error ? err.message : 'เซสชันไม่สามารถยืนยันกับ Portal SSO-VR ได้'
    );
    return false;
  }
}

export async function signOutVehicleApp(): Promise<void> {
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  useAuthStore
    .getState()
    .clearAuth('SIGNED_OUT', 'ออกจากระบบเรียบร้อยแล้ว กรุณาเข้าใช้งานใหม่ผ่าน Portal SSO-VR');
}
