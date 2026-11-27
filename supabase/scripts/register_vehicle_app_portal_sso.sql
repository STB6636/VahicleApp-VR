-- =============================================================================
-- Portal SSO-VR Registration Script for VEHICLE_APP (Section 3 of Plan)
--
-- Idempotent DATA-ONLY registration matching Portal SSO-VR 3NF tables:
--   - public.webapps
--   - public.webapp_roles
--   - public.webapp_scopes
--   - public.webapp_allowed_origins
--
-- ZERO DDL alterations to `public` schema.
-- Run once in Supabase SQL Editor (or configure via Portal SSO /admin/webapps UI).
-- =============================================================================

DO $$
DECLARE
  v_webapp_id uuid;
BEGIN
  -- 1. Upsert VEHICLE_APP into public.webapps
  INSERT INTO public.webapps (
    app_code,
    name,
    description,
    url,
    icon,
    color,
    status,
    auto_grant_on_provision,
    sort_order
  ) VALUES (
    'VEHICLE_APP',
    'ระบบต่อภาษีและใบอนุญาตยานพาหนะราชการ',
    'ระบบทะเบียนรถและเรือราชการ ติดตามวันสิ้นอายุภาษี/ใบอนุญาตเรือ แจ้งซ่อมบำรุง และพิมพ์รายงาน (Schema: vehicleapp)',
    'https://stb6636.github.io/VahicleApp-VR/#/sso-callback',
    'fa-car-rear',
    '#00744B',
    'ACTIVE',
    false,
    20
  )
  ON CONFLICT (app_code) DO UPDATE
  SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    icon = EXCLUDED.icon,
    color = EXCLUDED.color,
    status = 'ACTIVE',
    updated_at = now()
  RETURNING id INTO v_webapp_id;

  -- 2. Upsert the 3 standard VEHICLE_APP roles
  INSERT INTO public.webapp_roles (
    webapp_id, role_code, role_name_th, description, hierarchy_level, color_hex,
    is_default_on_grant, is_app_admin, allow_scoped_admin_grant, sort_order, is_active
  ) VALUES
    (v_webapp_id, 'APP_ADMIN', 'ผู้ดูแลระบบยานพาหนะสูงสุด', 'จัดการยานพาหนะทุกส่วนราชการ คืนสถานะปกติ ตั้งค่าระบบ และดู Audit Log', 90, '#BE123C', false, true, false, 1, true),
    (v_webapp_id, 'FLEET_ADMIN', 'ผู้ดูแลยานพาหนะประจำหน่วยงาน', 'เพิ่ม/แก้ไข/ลบข้อมูลยานพาหนะ และแก้ไขประวัติกิจกรรมภายในขอบเขตสังกัด', 50, '#D97706', false, false, true, 2, true),
    (v_webapp_id, 'DEPT_OFFICER', 'เจ้าหน้าที่ผู้ใช้งานยานพาหนะ', 'ดูข้อมูลยานพาหนะ บันทึกต่อภาษี/ซ่อมบำรุง และพิมพ์รายงานภายในฝ่าย/ส่วนของตน', 10, '#00744B', true, false, true, 3, true)
  ON CONFLICT (webapp_id, role_code) DO UPDATE
  SET
    role_name_th = EXCLUDED.role_name_th,
    description = EXCLUDED.description,
    hierarchy_level = EXCLUDED.hierarchy_level,
    color_hex = EXCLUDED.color_hex,
    is_default_on_grant = EXCLUDED.is_default_on_grant,
    is_app_admin = EXCLUDED.is_app_admin,
    allow_scoped_admin_grant = EXCLUDED.allow_scoped_admin_grant,
    sort_order = EXCLUDED.sort_order,
    is_active = true,
    updated_at = now();

  -- 3. Attach PDPA Least-Privilege API scopes
  INSERT INTO public.webapp_scopes (webapp_id, scope_code)
  VALUES
    (v_webapp_id, 'permission:read'),
    (v_webapp_id, 'reference:read'),
    (v_webapp_id, 'position:read'),
    (v_webapp_id, 'personnel:read')
  ON CONFLICT (webapp_id, scope_code) DO NOTHING;

  -- 4. Register allowed SPA origins (add Cloudflare Pages domain if deployed there)
  INSERT INTO public.webapp_allowed_origins (webapp_id, origin_url)
  VALUES
    (v_webapp_id, 'https://stb6636.github.io'),
    (v_webapp_id, 'http://localhost:5174')
  ON CONFLICT (webapp_id, origin_url) DO NOTHING;
END $$;
