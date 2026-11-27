-- =============================================================================
-- Vehicle App — Migration 004: v2.0 Improvement Hardening
-- Schema: vehicleapp (ZERO DDL changes to `public` schema)
--
-- Features & Fixes:
--   1. `vehicle_types.is_default` + partial unique index `uq_vehicle_types_single_default`
--      and `vehicle_type_sort_order` exposed on `v_vehicles_enriched`.
--   2. Zero-hardcode `app_settings` seeds (`default_province`, `dashboard_tracking_limit`,
--      `dashboard_recent_limit`, `activities_page_size`, `notification_max_items`,
--      `notify_maintenance_status`).
--   3. Strict 3-Role RBAC (`SUPERADMIN`, `ADMIN [Lv2/Lv3]`, `USER [blocked]`):
--      - `fn_is_vehicle_superadmin()` helper
--      - `vapp_read_audit_logs` restricted strictly to SuperAdmin
--      - `fn_refresh_vehicle_statuses()` restricted strictly to SuperAdmin / service_role
--      - `fn_record_vehicle_activity()` requires Admin+ (blocks USER while User role is closed)
--        and records fresh computed `previous_status` instead of stale `status_code`.
--   4. PDPA-safe `fn_list_caretaker_candidates(p_office_id, p_department_id)` RPC:
--      - Admin-only (`fn_is_vehicle_admin()`), scoped by `fn_can_access_vehicle()`,
--        filters `allows_account_provision = true`, no 500-row truncation.
--   5. `fn_get_cron_status()` + daily `pg_cron` schedule (`0 17 * * *` UTC = 00:00 Bangkok).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. vehicle_types.is_default + v_vehicles_enriched.vehicle_type_sort_order
-- -----------------------------------------------------------------------------
ALTER TABLE vehicleapp.vehicle_types
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vehicleapp.vehicle_types WHERE is_default = true) THEN
    UPDATE vehicleapp.vehicle_types
    SET is_default = true
    WHERE id = (
      SELECT id FROM vehicleapp.vehicle_types
      WHERE is_active = true
      ORDER BY (code = 'CAR') DESC, sort_order ASC, name_th ASC
      LIMIT 1
    );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_vehicle_types_single_default
  ON vehicleapp.vehicle_types ((true))
  WHERE is_default = true;

DROP VIEW IF EXISTS vehicleapp.v_vehicles_enriched;
CREATE VIEW vehicleapp.v_vehicles_enriched
WITH (security_invoker = true)
AS
SELECT
  v.id,
  v.vehicle_code,
  v.vehicle_type_id,
  vt.code AS vehicle_type_code,
  vt.name_th AS vehicle_type_name,
  vt.sort_order AS vehicle_type_sort_order,
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
  ct.full_name AS caretaker_name,
  ct.position_display AS caretaker_position_display,
  ct.position_name AS caretaker_position,
  ct.position_level_name AS caretaker_level,
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
LEFT JOIN LATERAL vehicleapp.fn_get_caretaker_display(v.caretaker_personnel_id) ct ON true;

-- -----------------------------------------------------------------------------
-- 2. Zero-Hardcode app_settings Seeds
-- -----------------------------------------------------------------------------
INSERT INTO vehicleapp.app_settings (key, value, description, setting_group) VALUES
  ('default_province', 'กรุงเทพมหานคร', 'จังหวัดเริ่มต้นเมื่อเพิ่มรถราชการใหม่', 'general'),
  ('dashboard_tracking_limit', '15', 'จำนวนรายการสูงสุดในคิวติดตามเร่งด่วนบนหน้าภาพรวม (Dashboard)', 'general'),
  ('dashboard_recent_limit', '5', 'จำนวนรายการประวัติกิจกรรมล่าสุดที่แสดงบนหน้าภาพรวม (Dashboard)', 'general'),
  ('activities_page_size', '10', 'จำนวนรายการประวัติกิจกรรมต่อหน้า', 'general'),
  ('notification_max_items', '30', 'จำนวนรายการแจ้งเตือนสูงสุดในกระดิ่งแจ้งเตือน', 'general'),
  ('notify_maintenance_status', 'true', 'แจ้งเตือนยานพาหนะที่อยู่ระหว่างซ่อมบำรุงในกระดิ่งแจ้งเตือน (true / false)', 'general')
ON CONFLICT (key) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 3. Strict 3-Role RBAC Helpers & RLS Hardening
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION vehicleapp.fn_is_vehicle_superadmin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = vehicleapp, public
AS $$
  SELECT public.fn_current_user_role() = 'SUPERADMIN'
    OR vehicleapp.fn_my_app_role_level() >= 90;
$$;

-- Tighten audit_logs SELECT policy to SuperAdmin ONLY
DROP POLICY IF EXISTS "vapp_read_audit_logs" ON vehicleapp.audit_logs;
CREATE POLICY "vapp_read_audit_logs" ON vehicleapp.audit_logs
  FOR SELECT TO authenticated
  USING (vehicleapp.fn_is_vehicle_superadmin());

-- Tighten fn_refresh_vehicle_statuses() to SuperAdmin / service_role / postgres
CREATE OR REPLACE FUNCTION vehicleapp.fn_refresh_vehicle_statuses()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vehicleapp, public
AS $$
DECLARE
  v_is_service boolean := (
    COALESCE(auth.role(), '') = 'service_role'
    OR (auth.uid() IS NULL AND COALESCE(auth.role(), '') = '' AND session_user = 'postgres')
  );
  v_warn_days integer := vehicleapp.fn_get_warning_days();
  v_updated integer := 0;
BEGIN
  IF NOT v_is_service AND NOT vehicleapp.fn_is_vehicle_superadmin() THEN
    RAISE EXCEPTION 'Forbidden: requires SuperAdmin role' USING ERRCODE = '42501';
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

-- Harden fn_record_vehicle_activity():
--  - Require Admin+ (USER role is currently closed)
--  - Compute fresh `previous_status` so audit trail never logs stale status_code
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
  v_is_super boolean;
  v_unique_ids uuid[];
  v_vid uuid;
  v_rec record;
  v_prev_status text;
  v_is_maint boolean;
  v_new_expiry date;
  v_new_vessel_no text;
  v_new_status text;
  v_label text;
  v_count integer := 0;
BEGIN
  IF v_uid IS NULL OR NOT vehicleapp.fn_is_vehicle_admin() THEN
    RAISE EXCEPTION 'Forbidden: เฉพาะผู้ดูแลระบบ (SuperAdmin / Admin) เท่านั้นที่สามารถบันทึกรายการได้' USING ERRCODE = '42501';
  END IF;

  SELECT ARRAY(SELECT DISTINCT x FROM unnest(COALESCE(p_vehicle_ids, ARRAY[]::uuid[])) AS x WHERE x IS NOT NULL)
  INTO v_unique_ids;

  IF v_unique_ids IS NULL OR array_length(v_unique_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'กรุณาเลือกยานพาหนะอย่างน้อย 1 รายการ';
  END IF;

  v_is_super := vehicleapp.fn_is_vehicle_superadmin();

  IF p_activity_type = 'RESTORE_NORMAL' AND NOT v_is_super THEN
    RAISE EXCEPTION 'เฉพาะผู้ดูแลระบบสูงสุด (SuperAdmin) เท่านั้นที่สามารถคืนสถานะกลับเป็นปกติได้' USING ERRCODE = '42501';
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
    ELSE NULL
  END;

  IF v_label IS NULL THEN
    RAISE EXCEPTION 'ประเภทรายการไม่ถูกต้อง: %', COALESCE(p_activity_type, 'NULL');
  END IF;

  FOREACH v_vid IN ARRAY v_unique_ids LOOP
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
      RAISE EXCEPTION 'ไม่มีสิทธิ์ดำเนินการยานพาหนะรายการนี้: %', v_rec.vehicle_code USING ERRCODE = '42501';
    END IF;

    v_prev_status := vehicleapp.fn_compute_vehicle_status(
      v_rec.current_expiry_date,
      v_rec.is_under_maintenance,
      v_rec.status_code
    );

    -- Terminal status transition guards
    IF v_rec.status_code = 'DISPOSED' AND p_activity_type <> 'RESTORE_NORMAL' THEN
      RAISE EXCEPTION 'ยานพาหนะ % อยู่ในสถานะจำหน่ายแล้ว ต้องให้ผู้ดูแลระบบสูงสุดคืนสถานะก่อน', v_rec.vehicle_code;
    END IF;

    IF v_rec.status_code = 'DECOMMISSIONED' AND p_activity_type NOT IN ('DISPOSE', 'RESTORE_NORMAL') THEN
      RAISE EXCEPTION 'ยานพาหนะ % อยู่ในสถานะยุบสภาพรอจำหน่าย สามารถดำเนินการได้เฉพาะจำหน่ายหรือคืนสถานะ', v_rec.vehicle_code;
    END IF;

    IF p_activity_type = 'RESTORE_NORMAL' AND v_rec.status_code NOT IN ('DISPOSED', 'DECOMMISSIONED') THEN
      RAISE EXCEPTION 'ยานพาหนะ % ไม่ได้อยู่ในสถานะจำหน่ายหรือยุบสภาพรอจำหน่าย', v_rec.vehicle_code;
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
      v_prev_status, v_new_status, v_uid, v_actor_name
    );

    UPDATE vehicleapp.vehicles
    SET current_expiry_date = v_new_expiry,
        vessel_license_no = v_new_vessel_no,
        is_under_maintenance = v_is_maint,
        status_code = v_new_status,
        disposal_date = CASE
          WHEN p_activity_type = 'DISPOSE' THEN COALESCE(p_start_date, disposal_date, (now() AT TIME ZONE 'Asia/Bangkok')::date)
          WHEN p_activity_type = 'RESTORE_NORMAL' THEN NULL
          ELSE disposal_date
        END,
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
    array_to_string(v_unique_ids, ','),
    jsonb_build_object('count', v_count, 'activity_type', p_activity_type)
  );

  RETURN jsonb_build_object(
    'success', true,
    'updated_count', v_count,
    'message', 'บันทึกรายการสำเร็จ ' || v_count || ' รายการ'
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. PDPA-Safe Caretaker Candidates RPC (Admin-only, Scoped, No 500-row cap)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION vehicleapp.fn_list_caretaker_candidates(
  p_office_id uuid DEFAULT NULL,
  p_department_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  prefix_name text,
  first_name text,
  last_name text,
  full_name text,
  position_name text,
  position_level_name text,
  position_display text,
  office_id uuid,
  office_name text,
  department_id uuid,
  department_name text,
  division_id uuid,
  division_name text,
  allows_account_provision boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = vehicleapp, public
AS $$
DECLARE
  v_is_service boolean := (
    COALESCE(auth.role(), '') = 'service_role'
    OR (auth.uid() IS NULL AND COALESCE(auth.role(), '') = '' AND session_user = 'postgres')
  );
BEGIN
  IF NOT v_is_service AND NOT vehicleapp.fn_is_vehicle_admin() THEN
    RAISE EXCEPTION 'Forbidden: requires Vehicle App admin role' USING ERRCODE = '42501';
  END IF;

  -- Require at least one org filter (prevents accidental full-directory dumps)
  IF p_department_id IS NULL AND p_office_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    pd.id,
    pd.prefix_name::text,
    pd.first_name::text,
    pd.last_name::text,
    pd.full_name::text,
    pd.position_name::text,
    pd.position_level_name::text,
    pd.position_display::text,
    pd.office_id,
    pd.office_name::text,
    pd.department_id,
    pd.department_name::text,
    pd.division_id,
    pd.division_name::text,
    COALESCE(pd.allows_account_provision, true) AS allows_account_provision
  FROM public.v_personnel_directory pd
  WHERE COALESCE(pd.allows_account_provision, true) = true
    AND (
      (p_department_id IS NOT NULL AND pd.department_id = p_department_id)
      OR (p_department_id IS NULL AND p_office_id IS NOT NULL AND pd.office_id = p_office_id)
    )
    AND (
      v_is_service
      OR vehicleapp.fn_can_access_vehicle(pd.office_id, pd.department_id, pd.id)
    )
  ORDER BY pd.first_name ASC NULLS LAST, pd.last_name ASC NULLS LAST;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. Daily pg_cron Status Refresh (00:00 Asia/Bangkok = 17:00 UTC) & Status RPC
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_job_id bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    SELECT jobid INTO v_job_id
    FROM cron.job
    WHERE jobname = 'vehicleapp-daily-status-refresh'
    LIMIT 1;

    IF v_job_id IS NOT NULL THEN
      PERFORM cron.unschedule(v_job_id);
    END IF;

    PERFORM cron.schedule(
      'vehicleapp-daily-status-refresh',
      '0 17 * * *',
      'SELECT vehicleapp.fn_refresh_vehicle_statuses();'
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION vehicleapp.fn_get_cron_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = vehicleapp, public
AS $$
DECLARE
  v_is_service boolean := (
    COALESCE(auth.role(), '') = 'service_role'
    OR (auth.uid() IS NULL AND COALESCE(auth.role(), '') = '' AND session_user = 'postgres')
  );
  v_has_ext boolean := false;
  v_job record;
BEGIN
  IF NOT v_is_service AND NOT vehicleapp.fn_is_vehicle_superadmin() THEN
    RAISE EXCEPTION 'Forbidden: requires SuperAdmin role' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') INTO v_has_ext;
  IF NOT v_has_ext THEN
    RETURN jsonb_build_object(
      'installed', false,
      'active', false,
      'jobname', 'vehicleapp-daily-status-refresh',
      'schedule', null
    );
  END IF;

  SELECT jobid, jobname, schedule, active
  INTO v_job
  FROM cron.job
  WHERE jobname = 'vehicleapp-daily-status-refresh'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'installed', true,
      'active', false,
      'jobname', 'vehicleapp-daily-status-refresh',
      'schedule', null
    );
  END IF;

  RETURN jsonb_build_object(
    'installed', true,
    'active', COALESCE(v_job.active, false),
    'jobid', v_job.jobid,
    'jobname', v_job.jobname,
    'schedule', v_job.schedule
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. Least-Privilege Grants (Revoke PUBLIC on all functions)
-- -----------------------------------------------------------------------------
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA vehicleapp FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA vehicleapp TO authenticated, service_role;
GRANT SELECT ON vehicleapp.v_vehicles_enriched TO authenticated, service_role;
