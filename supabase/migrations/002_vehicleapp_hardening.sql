-- =============================================================================
-- Vehicle App — Migration 002: Security, RLS, Caretaker Display & State Machine Hardening
-- Schema: vehicleapp (ZERO changes to `public` schema)
--
-- Fixes applied:
--   1. PDPA-safe caretaker display helper (`fn_get_caretaker_display`) so
--      `v_vehicles_enriched` returns caretaker name/position for all authorized
--      VEHICLE_APP users (not just Portal SUPERADMIN / matching ADMIN) while
--      keeping `v_vehicles_enriched` as `security_invoker = true`.
--   2. Scoped org access in `fn_can_access_vehicle` for Office-level (Lv2)
--      FLEET_ADMIN / USER assignments (`department_id IS NULL`).
--   3. Terminal state machine guards in `fn_record_vehicle_activity`:
--      - Blocks resurrecting `DISPOSED` / `DECOMMISSIONED` vehicles via non-RESTORE_NORMAL
--        actions (only `DISPOSE` allowed from `DECOMMISSIONED`, and `RESTORE_NORMAL`
--        restricted to SUPERADMIN / APP_ADMIN >= 90).
--      - Clears `disposal_date` on `RESTORE_NORMAL` and deduplicates `p_vehicle_ids`.
--   4. Hardens `vapp_update_activities` WITH CHECK to enforce target vehicle org scope.
--   5. Restricts `fn_schema_health()` and `fn_refresh_vehicle_statuses()` to authorized
--      VEHICLE_APP callers / service_role and revokes PUBLIC execute on all functions.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. PDPA-Safe Caretaker Display Helper (non-sensitive display fields only)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION vehicleapp.fn_get_caretaker_display(p_personnel_id uuid)
RETURNS TABLE (
  full_name text,
  position_display text,
  position_name text,
  position_level_name text
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
  IF p_personnel_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT v_is_service AND NOT vehicleapp.fn_has_vehicle_app_access() THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    pd.full_name,
    pd.position_display,
    pd.position_name,
    pd.position_level_name
  FROM public.v_personnel_directory pd
  WHERE pd.id = p_personnel_id
  LIMIT 1;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Recreate v_vehicles_enriched using PDPA-safe caretaker helper
--    (keeps security_invoker = true so vehicleapp.vehicles RLS is always enforced)
-- -----------------------------------------------------------------------------
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
-- 3. Strengthen fn_can_access_vehicle for Office Lv2 & FLEET_ADMIN scopes
-- -----------------------------------------------------------------------------
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
  v_my_office_id uuid;
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

  -- Resolve personnel_id and org assignment (Lv2 office / Lv3 department)
  SELECT u.personnel_id, pa.office_id, pa.department_id
  INTO v_my_pid, v_my_office_id, v_my_dept_id
  FROM public.users u
  LEFT JOIN public.personnel_assignments pa ON pa.personnel_id = u.personnel_id
  WHERE u.id = auth.uid() AND u.status = 'ACTIVE'
  LIMIT 1;

  -- Direct caretaker always has access
  IF v_my_pid IS NOT NULL AND p_caretaker_personnel_id IS NOT NULL AND v_my_pid = p_caretaker_personnel_id THEN
    RETURN true;
  END IF;

  -- App-level FLEET_ADMIN (hierarchy_level >= 50 with Portal role = USER)
  IF v_app_level >= 50 THEN
    IF v_my_dept_id IS NOT NULL AND p_department_id IS NOT NULL AND v_my_dept_id = p_department_id THEN
      RETURN true;
    END IF;
    IF v_my_dept_id IS NULL AND v_my_office_id IS NOT NULL AND p_office_id IS NOT NULL AND v_my_office_id = p_office_id THEN
      RETURN true;
    END IF;
    RETURN false;
  END IF;

  -- Standard USER: same department (Lv3), or Office Lv2 when both have no department_id
  IF v_my_dept_id IS NOT NULL AND p_department_id IS NOT NULL AND v_my_dept_id = p_department_id THEN
    RETURN true;
  END IF;

  IF v_my_dept_id IS NULL AND p_department_id IS NULL AND v_my_office_id IS NOT NULL AND p_office_id IS NOT NULL AND v_my_office_id = p_office_id THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Tighten vapp_update_activities WITH CHECK to enforce target vehicle scope
-- -----------------------------------------------------------------------------
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
  WITH CHECK (
    vehicleapp.fn_is_vehicle_admin()
    AND EXISTS (
      SELECT 1 FROM vehicleapp.vehicles v
      WHERE v.id = vehicle_id
        AND vehicleapp.fn_can_access_vehicle(v.office_id, v.department_id, v.caretaker_personnel_id)
    )
  );

-- -----------------------------------------------------------------------------
-- 5. Harden fn_refresh_vehicle_statuses() & fn_schema_health()
-- -----------------------------------------------------------------------------
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
  IF NOT v_is_service AND NOT vehicleapp.fn_is_vehicle_admin() THEN
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

CREATE OR REPLACE FUNCTION vehicleapp.fn_schema_health()
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
BEGIN
  IF NOT v_is_service AND NOT vehicleapp.fn_has_vehicle_app_access() THEN
    RAISE EXCEPTION 'Forbidden: requires active VEHICLE_APP access';
  END IF;

  RETURN jsonb_build_object(
    'schema', 'vehicleapp',
    'healthy', true,
    'vehicle_types_count', (SELECT count(*) FROM vehicleapp.vehicle_types),
    'vehicles_count', (SELECT count(*) FROM vehicleapp.vehicles),
    'activities_count', (SELECT count(*) FROM vehicleapp.vehicle_activities),
    'settings_count', (SELECT count(*) FROM vehicleapp.app_settings),
    'checked_at', now()
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. Harden fn_record_vehicle_activity() State Machine & Deduplication
-- -----------------------------------------------------------------------------
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
  v_unique_ids uuid[];
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

  SELECT ARRAY(SELECT DISTINCT x FROM unnest(COALESCE(p_vehicle_ids, ARRAY[]::uuid[])) AS x WHERE x IS NOT NULL)
  INTO v_unique_ids;

  IF v_unique_ids IS NULL OR array_length(v_unique_ids, 1) IS NULL THEN
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
      RAISE EXCEPTION 'ไม่มีสิทธิ์ดำเนินการยานพาหนะรายการนี้: %', v_rec.vehicle_code;
    END IF;

    -- Terminal status transition guards (prevent bypassing SUPERADMIN RESTORE_NORMAL)
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
      v_rec.status_code, v_new_status, v_uid, v_actor_name
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
-- 7. Revoke PUBLIC EXECUTE on all vehicleapp functions & tighten grants
-- -----------------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES IN SCHEMA vehicleapp REVOKE ALL ON FUNCTIONS FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA vehicleapp FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA vehicleapp TO authenticated, service_role;
GRANT SELECT ON vehicleapp.v_vehicles_enriched TO authenticated, service_role;
