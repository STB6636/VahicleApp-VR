-- =============================================================================
-- Portal SSO-VR Registration Script for VEHICLE_APP (3 Canonical Roles)
--
-- Canonical Roles ONLY:
--   1. SUPERADMIN — ผู้ดูแลระบบสูงสุด (SuperAdmin) [hierarchy_level = 90]
--   2. ADMIN      — ผู้ดูแลระบบ (Admin สำนักงาน/กอง, ส่วน/ฝ่าย) [hierarchy_level = 50]
--   3. USER       — ผู้ใช้งานทั่วไป (ยังไม่เปิดให้เข้าใช้งานในขณะนี้) [hierarchy_level = 10]
--
-- Idempotent DATA-ONLY script (ZERO DDL alterations to `public` schema).
-- Safely migrates any legacy role assignments (APP_ADMIN -> SUPERADMIN,
-- FLEET_ADMIN -> ADMIN, DEPT_OFFICER -> USER) before removing old role codes.
-- =============================================================================

DO $$
DECLARE
  v_webapp_id uuid;
  v_super_role_id uuid;
  v_admin_role_id uuid;
  v_user_role_id uuid;
BEGIN
  -- 1. Upsert VEHICLE_APP into public.webapps (preserves customized production url on conflict)
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
    'https://vehicle-stb.pages.dev/sso-callback',
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

  -- 2. Upsert the 3 canonical VEHICLE_APP roles: SUPERADMIN, ADMIN, USER
  INSERT INTO public.webapp_roles (
    webapp_id, role_code, role_name_th, description, hierarchy_level, color_hex,
    is_default_on_grant, is_app_admin, allow_scoped_admin_grant, sort_order, is_active
  ) VALUES
    (
      v_webapp_id,
      'SUPERADMIN',
      'ผู้ดูแลระบบสูงสุด (SuperAdmin)',
      'จัดการยานพาหนะทุกส่วนราชการ คืนสถานะปกติ จัดการประเภทยานพาหนะ ตั้งค่าระบบ และดู Audit Log',
      90,
      '#BE123C',
      false,
      true,
      false,
      1,
      true
    ),
    (
      v_webapp_id,
      'ADMIN',
      'ผู้ดูแลระบบ (Admin สำนักงาน/กอง, ส่วน/ฝ่าย)',
      'เพิ่ม/แก้ไข/ลบข้อมูลยานพาหนะ บันทึกกิจกรรม และพิมพ์รายงานภายในขอบเขตสังกัด (สำนักงาน/กอง หรือ ส่วน/ฝ่าย)',
      50,
      '#D97706',
      true,
      false,
      true,
      2,
      true
    ),
    (
      v_webapp_id,
      'USER',
      'ผู้ใช้งานทั่วไป (ยังไม่เปิดให้เข้าใช้งาน)',
      'ระดับผู้ใช้งานทั่วไป — ปิดการเข้าใช้งานชั่วคราวในระยะปัจจุบัน',
      10,
      '#64748B',
      false,
      false,
      true,
      3,
      true
    )
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

  SELECT id INTO v_super_role_id FROM public.webapp_roles WHERE webapp_id = v_webapp_id AND role_code = 'SUPERADMIN';
  SELECT id INTO v_admin_role_id FROM public.webapp_roles WHERE webapp_id = v_webapp_id AND role_code = 'ADMIN';
  SELECT id INTO v_user_role_id  FROM public.webapp_roles WHERE webapp_id = v_webapp_id AND role_code = 'USER';

  -- 3. Migrate any existing permissions from legacy codes (APP_ADMIN / FLEET_ADMIN / DEPT_OFFICER)
  UPDATE public.user_app_permissions uap
  SET webapp_role_id = v_super_role_id, updated_at = now()
  WHERE uap.webapp_id = v_webapp_id
    AND uap.webapp_role_id IN (
      SELECT id FROM public.webapp_roles WHERE webapp_id = v_webapp_id AND role_code = 'APP_ADMIN'
    );

  UPDATE public.user_app_permissions uap
  SET webapp_role_id = v_admin_role_id, updated_at = now()
  WHERE uap.webapp_id = v_webapp_id
    AND uap.webapp_role_id IN (
      SELECT id FROM public.webapp_roles WHERE webapp_id = v_webapp_id AND role_code = 'FLEET_ADMIN'
    );

  UPDATE public.user_app_permissions uap
  SET webapp_role_id = v_user_role_id, updated_at = now()
  WHERE uap.webapp_id = v_webapp_id
    AND uap.webapp_role_id IN (
      SELECT id FROM public.webapp_roles WHERE webapp_id = v_webapp_id AND role_code = 'DEPT_OFFICER'
    );

  -- 4. Remove obsolete legacy role rows so ONLY SUPERADMIN, ADMIN, USER remain
  DELETE FROM public.webapp_roles
  WHERE webapp_id = v_webapp_id
    AND role_code IN ('APP_ADMIN', 'FLEET_ADMIN', 'DEPT_OFFICER');

  -- 5. Attach PDPA Least-Privilege API scopes
  INSERT INTO public.webapp_scopes (webapp_id, scope_code)
  VALUES
    (v_webapp_id, 'permission:read'),
    (v_webapp_id, 'reference:read'),
    (v_webapp_id, 'position:read'),
    (v_webapp_id, 'personnel:read')
  ON CONFLICT (webapp_id, scope_code) DO NOTHING;

  -- 6. Register allowed SPA origins (Cloudflare Pages + GitHub Pages + Local Dev)
  INSERT INTO public.webapp_allowed_origins (webapp_id, origin_url)
  VALUES
    (v_webapp_id, 'https://vehicle-stb.pages.dev'),
    (v_webapp_id, 'https://stb6636.github.io'),
    (v_webapp_id, 'http://localhost:5174')
  ON CONFLICT (webapp_id, origin_url) DO NOTHING;
END $$;
