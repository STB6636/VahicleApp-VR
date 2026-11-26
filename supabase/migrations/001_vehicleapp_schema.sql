-- =============================================================================
-- Vehicle App (ระบบต่อภาษีและใบอนุญาตยานพาหนะราชการ) — Schema: vehicleapp
-- Migration 001: Multi-Schema Architecture on Portal SSO-STB Supabase Project
--
-- Boundaries & Rules:
--   1. ALL Vehicle App objects live strictly inside schema `vehicleapp`.
--   2. Zero writes/alterations to `public` schema (Core HR & SSO Identity).
--   3. Cross-Schema Foreign Keys reference `public.org_units(id)`,
--      `public.personnel(id)`, and `public.users(id)`.
--   4. Scoped RLS enforces Portal SSO `VEHICLE_APP` permission + Org Scope.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS vehicleapp;

-- Grants for Supabase API roles
GRANT USAGE ON SCHEMA vehicleapp TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA vehicleapp
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA vehicleapp
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA vehicleapp
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA vehicleapp
  GRANT ALL ON SEQUENCES TO service_role;

-- Sequences for human-readable legacy-compatible codes (VH0001, ACT0001)
CREATE SEQUENCE IF NOT EXISTS vehicleapp.seq_vehicle_code START 1;
CREATE SEQUENCE IF NOT EXISTS vehicleapp.seq_activity_code START 1;

-- =============================================================================
-- 1. Tables (3NF — 6 Tables)
-- =============================================================================

-- 1.1 Master Vehicle Types (extensible, replaces hardcoded types)
CREATE TABLE IF NOT EXISTS vehicleapp.vehicle_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name_th text NOT NULL,
  is_vessel boolean NOT NULL DEFAULT false,
  default_caretaker_position text,
  icon_name text NOT NULL DEFAULT 'fa-car',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 1.2 Vehicles Registry (Cars, Motorcycles, Trucks, Vessels)
CREATE TABLE IF NOT EXISTS vehicleapp.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_code text UNIQUE NOT NULL DEFAULT ('VH' || lpad(nextval('vehicleapp.seq_vehicle_code')::text, 4, '0')),
  vehicle_type_id uuid NOT NULL REFERENCES vehicleapp.vehicle_types(id) ON DELETE RESTRICT,
  license_plate text,
  province text,
  vessel_name text,
  vessel_license_no text,
  brand text,
  model text,
  model_year smallint,
  engine_cc integer,
  price numeric(14, 2),
  acquisition_date date,
  disposal_date date,
  current_expiry_date date NOT NULL,
  office_id uuid REFERENCES public.org_units(id) ON DELETE RESTRICT,
  department_id uuid REFERENCES public.org_units(id) ON DELETE RESTRICT,
  division_id uuid REFERENCES public.org_units(id) ON DELETE SET NULL,
  caretaker_personnel_id uuid REFERENCES public.personnel(id) ON DELETE SET NULL,
  status_code text NOT NULL DEFAULT 'NORMAL' CHECK (
    status_code IN (
      'NORMAL',
      'WARNING',
      'EXPIRED',
      'MAINTENANCE',
      'MAINTENANCE_WARNING',
      'MAINTENANCE_EXPIRED',
      'DECOMMISSIONED',
      'DISPOSED'
    )
  ),
  is_under_maintenance boolean NOT NULL DEFAULT false,
  attachment_folder_id text,
  latest_file_url text,
  remarks text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicles_type ON vehicleapp.vehicles(vehicle_type_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_office_dept ON vehicleapp.vehicles(office_id, department_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_caretaker ON vehicleapp.vehicles(caretaker_personnel_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicleapp.vehicles(status_code);
CREATE INDEX IF NOT EXISTS idx_vehicles_expiry ON vehicleapp.vehicles(current_expiry_date);

-- 1.3 Vehicle Activity & Renewal History (replaces Activity_History)
CREATE TABLE IF NOT EXISTS vehicleapp.vehicle_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_code text UNIQUE NOT NULL DEFAULT ('ACT' || lpad(nextval('vehicleapp.seq_activity_code')::text, 4, '0')),
  vehicle_id uuid NOT NULL REFERENCES vehicleapp.vehicles(id) ON DELETE CASCADE,
  activity_type text NOT NULL CHECK (
    activity_type IN (
      'TAX_RENEWAL',
      'MAINTENANCE_SEND',
      'MAINTENANCE_COMPLETE',
      'DECOMMISSION',
      'DISPOSE',
      'RESTORE_NORMAL'
    )
  ),
  activity_label_th text NOT NULL,
  document_no text,
  start_date date,
  expiry_date date,
  location text,
  details text,
  file_url text,
  file_name text,
  previous_status text,
  new_status text,
  recorded_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  recorded_by_name text NOT NULL,
  updated_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by_name text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activities_vehicle ON vehicleapp.vehicle_activities(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_activities_recorded_at ON vehicleapp.vehicle_activities(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_type ON vehicleapp.vehicle_activities(activity_type);

-- 1.4 App-Specific Settings (replaces System_Settings)
CREATE TABLE IF NOT EXISTS vehicleapp.app_settings (
  key text PRIMARY KEY,
  value text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  setting_group text NOT NULL DEFAULT 'general',
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 1.5 Notification Read Receipts (replaces localStorage dismissedNotifications)
CREATE TABLE IF NOT EXISTS vehicleapp.notification_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  ref_key text NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, ref_key)
);

CREATE INDEX IF NOT EXISTS idx_notification_reads_user ON vehicleapp.notification_reads(user_id);

-- 1.6 Vehicle App Audit Logs
CREATE TABLE IF NOT EXISTS vehicleapp.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  actor_name text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_audit_created_at ON vehicleapp.audit_logs(created_at DESC);

-- =============================================================================
-- 2. Triggers (updated_at timestamps)
-- =============================================================================

CREATE OR REPLACE FUNCTION vehicleapp.fn_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vehicle_types_updated ON vehicleapp.vehicle_types;
CREATE TRIGGER trg_vehicle_types_updated
  BEFORE UPDATE ON vehicleapp.vehicle_types
  FOR EACH ROW EXECUTE FUNCTION vehicleapp.fn_touch_updated_at();

DROP TRIGGER IF EXISTS trg_vehicles_updated ON vehicleapp.vehicles;
CREATE TRIGGER trg_vehicles_updated
  BEFORE UPDATE ON vehicleapp.vehicles
  FOR EACH ROW EXECUTE FUNCTION vehicleapp.fn_touch_updated_at();

DROP TRIGGER IF EXISTS trg_vehicle_activities_updated ON vehicleapp.vehicle_activities;
CREATE TRIGGER trg_vehicle_activities_updated
  BEFORE UPDATE ON vehicleapp.vehicle_activities
  FOR EACH ROW EXECUTE FUNCTION vehicleapp.fn_touch_updated_at();

DROP TRIGGER IF EXISTS trg_app_settings_updated ON vehicleapp.app_settings;
CREATE TRIGGER trg_app_settings_updated
  BEFORE UPDATE ON vehicleapp.app_settings
  FOR EACH ROW EXECUTE FUNCTION vehicleapp.fn_touch_updated_at();

-- =============================================================================
-- 3. Domain & Scoped RBAC Helper Functions
-- =============================================================================

CREATE OR REPLACE FUNCTION vehicleapp.fn_get_warning_days()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = vehicleapp, public
AS $$
  SELECT COALESCE(
    NULLIF(regexp_replace(value, '[^0-9]', '', 'g'), '')::integer,
    45
  )
  FROM vehicleapp.app_settings
  WHERE key = 'warning_days_before'
  LIMIT 1;
$$;

-- Single Source of Truth for the 8 Vehicle Statuses (Asia/Bangkok timezone)
CREATE OR REPLACE FUNCTION vehicleapp.fn_compute_vehicle_status(
  p_expiry_date date,
  p_is_under_maintenance boolean,
  p_current_status text DEFAULT 'NORMAL',
  p_warning_days integer DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = vehicleapp, public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Bangkok')::date;
  v_warn_days integer := COALESCE(p_warning_days, vehicleapp.fn_get_warning_days(), 45);
  v_diff integer;
  v_is_maint boolean;
BEGIN
  IF p_current_status IN ('DISPOSED', 'DECOMMISSIONED') THEN
    RETURN p_current_status;
  END IF;

  v_is_maint := COALESCE(p_is_under_maintenance, false)
    OR p_current_status IN ('MAINTENANCE', 'MAINTENANCE_WARNING', 'MAINTENANCE_EXPIRED');

  IF p_expiry_date IS NULL THEN
    RETURN CASE WHEN v_is_maint THEN 'MAINTENANCE' ELSE 'NORMAL' END;
  END IF;

  v_diff := (p_expiry_date - v_today);

  IF v_diff < 0 THEN
    RETURN CASE WHEN v_is_maint THEN 'MAINTENANCE_EXPIRED' ELSE 'EXPIRED' END;
  ELSIF v_diff <= v_warn_days THEN
    RETURN CASE WHEN v_is_maint THEN 'MAINTENANCE_WARNING' ELSE 'WARNING' END;
  ELSE
    RETURN CASE WHEN v_is_maint THEN 'MAINTENANCE' ELSE 'NORMAL' END;
  END IF;
END;
$$;

-- Returns active hierarchy_level for VEHICLE_APP (99 for Portal SUPERADMIN, 0 if no access)
CREATE OR REPLACE FUNCTION vehicleapp.fn_my_app_role_level()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = vehicleapp, public
AS $$
DECLARE
  v_portal_role text;
  v_level integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN 0;
  END IF;

  v_portal_role := public.fn_current_user_role();
  IF v_portal_role = 'SUPERADMIN' THEN
    RETURN 99;
  END IF;

  SELECT COALESCE(wr.hierarchy_level, 0) INTO v_level
  FROM public.user_app_permissions uap
  JOIN public.webapps w ON w.id = uap.webapp_id
  JOIN public.webapp_roles wr ON wr.id = uap.webapp_role_id
  WHERE uap.user_id = auth.uid()
    AND upper(w.app_code) = 'VEHICLE_APP'
    AND w.status <> 'DISABLED'
    AND uap.is_allowed = true
    AND wr.is_active = true
    AND (uap.expires_at IS NULL OR uap.expires_at > now())
  LIMIT 1;

  RETURN COALESCE(v_level, 0);
END;
$$;

CREATE OR REPLACE FUNCTION vehicleapp.fn_has_vehicle_app_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = vehicleapp, public
AS $$
  SELECT vehicleapp.fn_my_app_role_level() > 0;
$$;

CREATE OR REPLACE FUNCTION vehicleapp.fn_is_vehicle_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = vehicleapp, public
AS $$
  SELECT public.fn_current_user_role() = 'SUPERADMIN'
    OR (
      vehicleapp.fn_has_vehicle_app_access()
      AND (
        public.fn_current_user_role() = 'ADMIN'
        OR vehicleapp.fn_my_app_role_level() >= 50
      )
    );
$$;

CREATE OR REPLACE FUNCTION vehicleapp.fn_can_access_vehicle(
  p_office_id uuid,
  p_department_id uuid,
  p_caretaker_personnel_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = vehicleapp, public
AS $$
DECLARE
  v_portal_role text;
  v_app_level integer;
  v_my_pid uuid;
  v_my_dept_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  v_portal_role := public.fn_current_user_role();
  IF v_portal_role = 'SUPERADMIN' THEN
    RETURN true;
  END IF;

  v_app_level := vehicleapp.fn_my_app_role_level();
  IF v_app_level <= 0 THEN
    RETURN false;
  END IF;

  -- App-level super admin (hierarchy_level >= 90) sees all
  IF v_app_level >= 90 THEN
    RETURN true;
  END IF;

  -- Portal Scoped Admin (Lv2 office_id / Lv3 department_id)
  IF v_portal_role = 'ADMIN' THEN
    RETURN public.fn_is_org_in_my_scope(p_office_id, p_department_id);
  END IF;

  -- Standard USER: direct caretaker OR same department (Lv3)
  SELECT u.personnel_id, pa.department_id
  INTO v_my_pid, v_my_dept_id
  FROM public.users u
  LEFT JOIN public.personnel_assignments pa ON pa.personnel_id = u.personnel_id
  WHERE u.id = auth.uid() AND u.status = 'ACTIVE'
  LIMIT 1;

  IF v_my_pid IS NOT NULL AND p_caretaker_personnel_id IS NOT NULL AND v_my_pid = p_caretaker_personnel_id THEN
    RETURN true;
  END IF;

  IF v_my_dept_id IS NOT NULL AND p_department_id IS NOT NULL AND v_my_dept_id = p_department_id THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- =============================================================================
-- 4. Row Level Security (RLS) on ALL 6 Tables
-- =============================================================================

ALTER TABLE vehicleapp.vehicle_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicleapp.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicleapp.vehicle_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicleapp.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicleapp.notification_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicleapp.audit_logs ENABLE ROW LEVEL SECURITY;

-- 4.1 vehicle_types
DROP POLICY IF EXISTS "vapp_read_vehicle_types" ON vehicleapp.vehicle_types;
CREATE POLICY "vapp_read_vehicle_types" ON vehicleapp.vehicle_types
  FOR SELECT TO authenticated
  USING (vehicleapp.fn_has_vehicle_app_access());

DROP POLICY IF EXISTS "vapp_sa_write_vehicle_types" ON vehicleapp.vehicle_types;
CREATE POLICY "vapp_sa_write_vehicle_types" ON vehicleapp.vehicle_types
  FOR ALL TO authenticated
  USING (public.fn_current_user_role() = 'SUPERADMIN' OR vehicleapp.fn_my_app_role_level() >= 90)
  WITH CHECK (public.fn_current_user_role() = 'SUPERADMIN' OR vehicleapp.fn_my_app_role_level() >= 90);

-- 4.2 vehicles
DROP POLICY IF EXISTS "vapp_select_vehicles" ON vehicleapp.vehicles;
CREATE POLICY "vapp_select_vehicles" ON vehicleapp.vehicles
  FOR SELECT TO authenticated
  USING (vehicleapp.fn_can_access_vehicle(office_id, department_id, caretaker_personnel_id));

DROP POLICY IF EXISTS "vapp_insert_vehicles" ON vehicleapp.vehicles;
CREATE POLICY "vapp_insert_vehicles" ON vehicleapp.vehicles
  FOR INSERT TO authenticated
  WITH CHECK (
    vehicleapp.fn_is_vehicle_admin()
    AND vehicleapp.fn_can_access_vehicle(office_id, department_id, caretaker_personnel_id)
  );

DROP POLICY IF EXISTS "vapp_update_vehicles" ON vehicleapp.vehicles;
CREATE POLICY "vapp_update_vehicles" ON vehicleapp.vehicles
  FOR UPDATE TO authenticated
  USING (
    vehicleapp.fn_is_vehicle_admin()
    AND vehicleapp.fn_can_access_vehicle(office_id, department_id, caretaker_personnel_id)
  )
  WITH CHECK (
    vehicleapp.fn_is_vehicle_admin()
    AND vehicleapp.fn_can_access_vehicle(office_id, department_id, caretaker_personnel_id)
  );

DROP POLICY IF EXISTS "vapp_delete_vehicles" ON vehicleapp.vehicles;
CREATE POLICY "vapp_delete_vehicles" ON vehicleapp.vehicles
  FOR DELETE TO authenticated
  USING (
    vehicleapp.fn_is_vehicle_admin()
    AND vehicleapp.fn_can_access_vehicle(office_id, department_id, caretaker_personnel_id)
  );

-- 4.3 vehicle_activities
DROP POLICY IF EXISTS "vapp_select_activities" ON vehicleapp.vehicle_activities;
CREATE POLICY "vapp_select_activities" ON vehicleapp.vehicle_activities
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM vehicleapp.vehicles v
      WHERE v.id = vehicle_id
        AND vehicleapp.fn_can_access_vehicle(v.office_id, v.department_id, v.caretaker_personnel_id)
    )
  );

DROP POLICY IF EXISTS "vapp_insert_activities" ON vehicleapp.vehicle_activities;
CREATE POLICY "vapp_insert_activities" ON vehicleapp.vehicle_activities
  FOR INSERT TO authenticated
  WITH CHECK (
    vehicleapp.fn_has_vehicle_app_access()
    AND EXISTS (
      SELECT 1 FROM vehicleapp.vehicles v
      WHERE v.id = vehicle_id
        AND vehicleapp.fn_can_access_vehicle(v.office_id, v.department_id, v.caretaker_personnel_id)
    )
  );

DROP POLICY IF EXISTS "vapp_update_activities" ON vehicleapp.vehicle_activities;
CREATE POLICY "vapp_update_activities" ON vehicleapp.vehicle_activities
  FOR UPDATE TO authenticated
  USING (
    vehicleapp.fn_is_vehicle_admin()
    AND EXISTS (
      SELECT 1 FROM vehicleapp.vehicles v
      WHERE v.id = vehicle_id
        AND vehicleapp.fn_can_access_vehicle(v.office_id, v.department_id, v.caretaker_personnel_id)
    )
  )
  WITH CHECK (vehicleapp.fn_is_vehicle_admin());

-- 4.4 app_settings
DROP POLICY IF EXISTS "vapp_read_settings" ON vehicleapp.app_settings;
CREATE POLICY "vapp_read_settings" ON vehicleapp.app_settings
  FOR SELECT TO authenticated
  USING (vehicleapp.fn_has_vehicle_app_access());

DROP POLICY IF EXISTS "vapp_write_settings" ON vehicleapp.app_settings;
CREATE POLICY "vapp_write_settings" ON vehicleapp.app_settings
  FOR ALL TO authenticated
  USING (public.fn_current_user_role() = 'SUPERADMIN' OR vehicleapp.fn_my_app_role_level() >= 90)
  WITH CHECK (public.fn_current_user_role() = 'SUPERADMIN' OR vehicleapp.fn_my_app_role_level() >= 90);

-- 4.5 notification_reads (own rows only)
DROP POLICY IF EXISTS "vapp_own_notification_reads" ON vehicleapp.notification_reads;
CREATE POLICY "vapp_own_notification_reads" ON vehicleapp.notification_reads
  FOR ALL TO authenticated
  USING (user_id = auth.uid() AND vehicleapp.fn_has_vehicle_app_access())
  WITH CHECK (user_id = auth.uid() AND vehicleapp.fn_has_vehicle_app_access());

-- 4.6 audit_logs
DROP POLICY IF EXISTS "vapp_read_audit_logs" ON vehicleapp.audit_logs;
CREATE POLICY "vapp_read_audit_logs" ON vehicleapp.audit_logs
  FOR SELECT TO authenticated
  USING (vehicleapp.fn_is_vehicle_admin());

DROP POLICY IF EXISTS "vapp_insert_audit_logs" ON vehicleapp.audit_logs;
CREATE POLICY "vapp_insert_audit_logs" ON vehicleapp.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (vehicleapp.fn_has_vehicle_app_access());

-- =============================================================================
-- 5. Views & Transactional RPCs
-- =============================================================================

CREATE OR REPLACE VIEW vehicleapp.v_vehicles_enriched
WITH (security_invoker = true)
AS
SELECT
  v.id,
  v.vehicle_code,
  v.vehicle_type_id,
  vt.code AS vehicle_type_code,
  vt.name_th AS vehicle_type_name,
  vt.is_vessel,
  vt.icon_name AS vehicle_type_icon,
  v.license_plate,
  v.province,
  v.vessel_name,
  v.vessel_license_no,
  CASE
    WHEN vt.is_vessel THEN COALESCE(NULLIF(concat_ws(' | ', NULLIF(v.vessel_name, ''), NULLIF(v.vessel_license_no, '')), ''), v.vehicle_code)
    ELSE COALESCE(NULLIF(concat_ws(' ', NULLIF(v.license_plate, ''), NULLIF(v.province, '')), ''), v.vehicle_code)
  END AS vehicle_label,
  v.brand,
  v.model,
  v.model_year,
  v.engine_cc,
  v.price,
  v.acquisition_date,
  v.disposal_date,
  v.current_expiry_date,
  (v.current_expiry_date - (now() AT TIME ZONE 'Asia/Bangkok')::date) AS days_until_expiry,
  v.office_id,
  ou_off.name_th AS office_name,
  v.department_id,
  ou_dept.name_th AS department_name,
  v.division_id,
  ou_div.name_th AS division_name,
  v.caretaker_personnel_id,
  pd.full_name AS caretaker_name,
  pd.position_display AS caretaker_position_display,
  pd.position_name AS caretaker_position,
  pd.position_level_name AS caretaker_level,
  v.status_code,
  vehicleapp.fn_compute_vehicle_status(v.current_expiry_date, v.is_under_maintenance, v.status_code) AS computed_status_code,
  v.is_under_maintenance,
  v.attachment_folder_id,
  v.latest_file_url,
  v.remarks,
  v.created_at,
  v.updated_at
FROM vehicleapp.vehicles v
JOIN vehicleapp.vehicle_types vt ON vt.id = v.vehicle_type_id
LEFT JOIN public.org_units ou_off ON ou_off.id = v.office_id
LEFT JOIN public.org_units ou_dept ON ou_dept.id = v.department_id
LEFT JOIN public.org_units ou_div ON ou_div.id = v.division_id
LEFT JOIN public.v_personnel_directory pd ON pd.id = v.caretaker_personnel_id;

-- Refresh vehicle statuses batch RPC
CREATE OR REPLACE FUNCTION vehicleapp.fn_refresh_vehicle_statuses()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vehicleapp, public
AS $$
DECLARE
  v_warn_days integer := vehicleapp.fn_get_warning_days();
  v_updated integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT vehicleapp.fn_is_vehicle_admin() THEN
    RAISE EXCEPTION 'Forbidden: requires Vehicle App admin role';
  END IF;

  UPDATE vehicleapp.vehicles
  SET status_code = vehicleapp.fn_compute_vehicle_status(current_expiry_date, is_under_maintenance, status_code, v_warn_days),
      updated_at = now()
  WHERE status_code NOT IN ('DISPOSED', 'DECOMMISSIONED')
    AND status_code IS DISTINCT FROM vehicleapp.fn_compute_vehicle_status(current_expiry_date, is_under_maintenance, status_code, v_warn_days);

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

-- Atomic multi-vehicle activity recording RPC
CREATE OR REPLACE FUNCTION vehicleapp.fn_record_vehicle_activity(
  p_vehicle_ids uuid[],
  p_activity_type text,
  p_document_no text DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_expiry_date date DEFAULT NULL,
  p_location text DEFAULT NULL,
  p_details text DEFAULT NULL,
  p_file_url text DEFAULT NULL,
  p_file_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vehicleapp, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_actor_name text;
  v_portal_role text;
  v_app_level integer;
  v_vid uuid;
  v_rec record;
  v_is_maint boolean;
  v_new_expiry date;
  v_new_vessel_no text;
  v_new_status text;
  v_label text;
  v_count integer := 0;
BEGIN
  IF v_uid IS NULL OR NOT vehicleapp.fn_has_vehicle_app_access() THEN
    RAISE EXCEPTION 'Unauthorized: no active VEHICLE_APP access';
  END IF;

  IF p_vehicle_ids IS NULL OR array_length(p_vehicle_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'กรุณาเลือกยานพาหนะอย่างน้อย 1 รายการ';
  END IF;

  v_portal_role := public.fn_current_user_role();
  v_app_level := vehicleapp.fn_my_app_role_level();

  IF p_activity_type = 'RESTORE_NORMAL' AND v_portal_role <> 'SUPERADMIN' AND v_app_level < 90 THEN
    RAISE EXCEPTION 'เฉพาะผู้ดูแลระบบสูงสุดเท่านั้นที่สามารถคืนสถานะกลับเป็นปกติได้';
  END IF;

  SELECT COALESCE(pd.full_name, u.username, 'ผู้ใช้งาน')
  INTO v_actor_name
  FROM public.users u
  LEFT JOIN public.v_personnel_directory pd ON pd.id = u.personnel_id
  WHERE u.id = v_uid;

  v_label := CASE p_activity_type
    WHEN 'TAX_RENEWAL' THEN 'ต่ออายุภาษี'
    WHEN 'MAINTENANCE_SEND' THEN 'รายงานการซ่อมบำรุง (ส่งซ่อม)'
    WHEN 'MAINTENANCE_COMPLETE' THEN 'รายงานการซ่อมบำรุง (รายงานผลการซ่อม)'
    WHEN 'DECOMMISSION' THEN 'ยุบสภาพรอจำหน่าย'
    WHEN 'DISPOSE' THEN 'จำหน่าย'
    WHEN 'RESTORE_NORMAL' THEN 'แก้ไขสถานะ (กลับเป็นปกติ)'
    ELSE p_activity_type
  END;

  FOREACH v_vid IN ARRAY p_vehicle_ids LOOP
    SELECT v.*, vt.is_vessel
    INTO v_rec
    FROM vehicleapp.vehicles v
    JOIN vehicleapp.vehicle_types vt ON vt.id = v.vehicle_type_id
    WHERE v.id = v_vid
    FOR UPDATE OF v;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ไม่พบข้อมูลยานพาหนะ: %', v_vid;
    END IF;

    IF NOT vehicleapp.fn_can_access_vehicle(v_rec.office_id, v_rec.department_id, v_rec.caretaker_personnel_id) THEN
      RAISE EXCEPTION 'ไม่มีสิทธิ์ดำเนินการยานพาหนะรายการนี้: %', v_rec.vehicle_code;
    END IF;

    IF p_activity_type = 'TAX_RENEWAL' AND p_expiry_date IS NULL THEN
      RAISE EXCEPTION 'กรุณาระบุวันสิ้นอายุใหม่สำหรับการต่ออายุภาษี';
    END IF;

    IF p_activity_type = 'TAX_RENEWAL' AND v_rec.is_vessel AND COALESCE(trim(p_document_no), '') = '' THEN
      RAISE EXCEPTION 'กรุณาระบุเลขที่ใบอนุญาตเรือสำหรับ %', v_rec.vehicle_code;
    END IF;

    v_is_maint := v_rec.is_under_maintenance;
    v_new_expiry := v_rec.current_expiry_date;
    v_new_vessel_no := v_rec.vessel_license_no;

    IF p_activity_type = 'TAX_RENEWAL' THEN
      v_new_expiry := p_expiry_date;
      IF v_rec.is_vessel THEN
        v_new_vessel_no := trim(p_document_no);
      END IF;
      v_new_status := vehicleapp.fn_compute_vehicle_status(v_new_expiry, v_is_maint, 'NORMAL');
    ELSIF p_activity_type = 'MAINTENANCE_SEND' THEN
      v_is_maint := true;
      v_new_status := vehicleapp.fn_compute_vehicle_status(v_new_expiry, true, 'MAINTENANCE');
    ELSIF p_activity_type = 'MAINTENANCE_COMPLETE' THEN
      v_is_maint := false;
      v_new_status := vehicleapp.fn_compute_vehicle_status(v_new_expiry, false, 'NORMAL');
    ELSIF p_activity_type = 'DECOMMISSION' THEN
      v_is_maint := false;
      v_new_status := 'DECOMMISSIONED';
    ELSIF p_activity_type = 'DISPOSE' THEN
      v_is_maint := false;
      v_new_status := 'DISPOSED';
    ELSIF p_activity_type = 'RESTORE_NORMAL' THEN
      v_is_maint := false;
      v_new_status := vehicleapp.fn_compute_vehicle_status(v_new_expiry, false, 'NORMAL');
    ELSE
      RAISE EXCEPTION 'ประเภทรายการไม่ถูกต้อง: %', p_activity_type;
    END IF;

    INSERT INTO vehicleapp.vehicle_activities (
      vehicle_id, activity_type, activity_label_th, document_no,
      start_date, expiry_date, location, details, file_url, file_name,
      previous_status, new_status, recorded_by_user_id, recorded_by_name
    ) VALUES (
      v_vid, p_activity_type, v_label,
      COALESCE(NULLIF(trim(p_document_no), ''), CASE WHEN p_activity_type = 'TAX_RENEWAL' THEN 'ต่อภาษีประจำปี' ELSE '-' END),
      p_start_date, p_expiry_date, NULLIF(trim(p_location), ''), NULLIF(trim(p_details), ''),
      NULLIF(trim(p_file_url), ''), NULLIF(trim(p_file_name), ''),
      v_rec.status_code, v_new_status, v_uid, v_actor_name
    );

    UPDATE vehicleapp.vehicles
    SET current_expiry_date = v_new_expiry,
        vessel_license_no = v_new_vessel_no,
        is_under_maintenance = v_is_maint,
        status_code = v_new_status,
        disposal_date = CASE WHEN p_activity_type = 'DISPOSE' THEN COALESCE(disposal_date, (now() AT TIME ZONE 'Asia/Bangkok')::date) ELSE disposal_date END,
        latest_file_url = COALESCE(NULLIF(trim(p_file_url), ''), latest_file_url),
        updated_by = v_uid,
        updated_at = now()
    WHERE id = v_vid;

    v_count := v_count + 1;
  END LOOP;

  INSERT INTO vehicleapp.audit_logs (actor_user_id, actor_name, action, entity_type, entity_id, payload)
  VALUES (
    v_uid,
    v_actor_name,
    'RECORD_ACTIVITY_' || p_activity_type,
    'vehicle_activities',
    array_to_string(p_vehicle_ids, ','),
    jsonb_build_object('count', v_count, 'activity_type', p_activity_type)
  );

  RETURN jsonb_build_object(
    'success', true,
    'updated_count', v_count,
    'message', 'บันทึกรายการสำเร็จ ' || v_count || ' รายการ'
  );
END;
$$;

-- Schema Health Check RPC
CREATE OR REPLACE FUNCTION vehicleapp.fn_schema_health()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = vehicleapp, public
AS $$
  SELECT jsonb_build_object(
    'schema', 'vehicleapp',
    'healthy', true,
    'vehicle_types_count', (SELECT count(*) FROM vehicleapp.vehicle_types),
    'vehicles_count', (SELECT count(*) FROM vehicleapp.vehicles),
    'activities_count', (SELECT count(*) FROM vehicleapp.vehicle_activities),
    'settings_count', (SELECT count(*) FROM vehicleapp.app_settings),
    'checked_at', now()
  );
$$;

-- Explicit grants on existing tables, sequences, views, functions
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA vehicleapp TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA vehicleapp TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA vehicleapp TO authenticated;

-- =============================================================================
-- 6. Initial Seed Data (Idempotent)
-- =============================================================================

INSERT INTO vehicleapp.vehicle_types (code, name_th, is_vessel, default_caretaker_position, icon_name, sort_order)
VALUES
  ('CAR', 'รถยนต์', false, 'พนักงานขับรถยนต์', 'fa-car-side', 1),
  ('MOTORCYCLE', 'รถจักรยานยนต์', false, 'พนักงานขับรถยนต์', 'fa-motorcycle', 2),
  ('TRUCK', 'รถบรรทุก', false, 'พนักงานขับรถยนต์', 'fa-truck', 3),
  ('VESSEL', 'เรือ', true, 'นายท้ายเรือ', 'fa-ship', 4)
ON CONFLICT (code) DO NOTHING;

INSERT INTO vehicleapp.app_settings (key, value, description, setting_group)
VALUES
  ('app_display_name', 'ระบบต่อภาษีและใบอนุญาตยานพาหนะราชการ', 'ชื่อเว็บแอปที่แสดงใน Sidebar และหัวเอกสารรายงาน', 'general'),
  ('warning_days_before', '45', 'จำนวนวันก่อนหมดอายุที่ให้ขึ้นสถานะกำลังจะขาดต่ออายุ', 'general'),
  ('max_file_mb', '10', 'ขนาดไฟล์แนบสูงสุด (MB) สำหรับเอกสารหลักฐานและใบอนุญาตเรือ', 'general'),
  ('default_theme', 'light', 'ธีมเริ่มต้นของระบบ (light / dark)', 'general'),
  ('gas_drive_bridge_url', '', 'URL Web App (exec) ของ GAS Google Drive Bridge สำหรับอัปโหลดหลักฐาน', 'storage'),
  ('activity_folder_id', '', 'ID หรือลิงก์โฟลเดอร์ Google Drive เก็บหลักฐานประวัติ (Activity Folder)', 'storage'),
  ('vessel_license_folder_id', '', 'ID หรือลิงก์โฟลเดอร์ Google Drive เก็บใบอนุญาตเรือ (Vessel License Folder)', 'storage'),
  ('report_header_org', 'สำนักเทศกิจ กรุงเทพมหานคร', 'ชื่อหน่วยงานหลักบนหัวกระดาษรายงาน PDF', 'report'),
  ('report_header_sub', 'สำนักงานตรวจและบังคับการ', 'ชื่อหน่วยงานรองบนหัวกระดาษรายงาน PDF', 'report')
ON CONFLICT (key) DO NOTHING;
