import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient';
import { createPortalClient } from '@/lib/portalClient';
import {
  hasPortalHandshakeFlag,
  isVehicleAdminOrAbove,
  markPortalHandshakeFlag,
  useAuthStore,
  type PortalBlockReason,
} from '@/stores/useAuthStore';
import type { PortalMeResponse, PortalSsoExchangeResponse } from '@/types/sso.types';

export const USER_ROLE_CLOSED_MESSAGE =
  'บัญชีระดับผู้ใช้งานทั่วไป (User) ยังไม่เปิดให้เข้าใช้งานระบบยานพาหนะราชการในขณะนี้ (เปิดเฉพาะระดับ SuperAdmin และ Admin สำนักงาน/กอง หรือ ส่วน/ฝ่าย) กรุณากลับไปยัง Portal SSO-VR';

export class PortalAuthBlockedError extends Error {
  readonly reason: PortalBlockReason;
  constructor(reason: PortalBlockReason, message: string) {
    super(message);
    this.name = 'PortalAuthBlockedError';
    this.reason = reason;
  }
}

/**
 * Step 1 (Portal SSO Handshake):
 * Exchanges a one-time `sso_token` issued by Portal SSO-VR via `POST /portal-api/sso/exchange`,
 * verifies the returned `otp_hash` against shared Supabase Auth (persisted strictly in sessionStorage),
 * defensively enriches `admin_scope` via `GET /portal-api/me`, and enforces 3-role access policy
 * (SuperAdmin & Admin [Lv2/Lv3] allowed; User currently blocked).
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
    throw new PortalAuthBlockedError(
      'NO_APP_PERMISSION',
      'บัญชีของท่านไม่ได้รับสิทธิ์เข้าใช้งานระบบยานพาหนะราชการ'
    );
  }

  if (!isVehicleAdminOrAbove(res.user, res.app_permission ?? null)) {
    throw new PortalAuthBlockedError('USER_ROLE_NOT_SUPPORTED', USER_ROLE_CLOSED_MESSAGE);
  }

  const { error: otpError } = await supabase.auth.verifyOtp({
    token_hash: res.otp_hash,
    type: 'magiclink',
  });
  if (otpError) {
    throw new Error(`ไม่สามารถสร้างเซสชัน Supabase Auth ได้: ${otpError.message}`);
  }

  let finalUser = res.user;
  let finalPersonnel = res.personnel ?? null;
  let finalPermission = res.app_permission ?? null;

  // Defensively enrich `admin_scope` (with org_unit_name & parent_office_id) via /me if missing
  if (finalUser.role === 'ADMIN' && !finalUser.admin_scope) {
    try {
      const { data: sessData } = await supabase.auth.getSession();
      const accessToken = sessData.session?.access_token;
      if (accessToken) {
        const me = (await createPortalClient(accessToken).getMe()) as PortalMeResponse;
        if (me?.success && me.user) {
          finalUser = {
            ...finalUser,
            ...me.user,
            username: me.user.username ?? finalUser.username,
            email: me.user.email ?? finalUser.email ?? me.personnel?.email ?? null,
          };
          finalPersonnel = me.personnel ?? finalPersonnel;
          finalPermission = me.app_permission ?? finalPermission;
        }
      }
    } catch {
      // Fall back to /sso/exchange payload cleanly
    }
  }

  if (finalUser.must_change_credential) {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    throw new PortalAuthBlockedError(
      'NO_APP_PERMISSION',
      'กรุณาเปลี่ยนรหัสผ่านเริ่มต้นใน Portal SSO-VR ก่อนเข้าใช้งานระบบนี้'
    );
  }

  if (!isVehicleAdminOrAbove(finalUser, finalPermission)) {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    throw new PortalAuthBlockedError('USER_ROLE_NOT_SUPPORTED', USER_ROLE_CLOSED_MESSAGE);
  }

  useAuthStore.getState().setSession({
    user: finalUser,
    personnel: finalPersonnel,
    appPermission: finalPermission,
  });

  return {
    ...res,
    user: finalUser,
    personnel: finalPersonnel,
    app_permission: finalPermission,
  };
}

/**
 * Step 2 (Tab-Refresh Verification & Direct-Link Blocking):
 * Called on app bootstrap when NOT arriving via `/sso-callback?sso_token=...`.
 * Enforces Requirement 8 & 3-Role Access Policy (SuperAdmin & Admin only; User blocked).
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

    if (!isVehicleAdminOrAbove(me.user, me.app_permission ?? null)) {
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      store.setBlocked('USER_ROLE_NOT_SUPPORTED', USER_ROLE_CLOSED_MESSAGE);
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
