-- =============================================================================
-- Vehicle App — Migration 003: DB-Level Terminal-State Lock Trigger
-- Schema: vehicleapp (ZERO changes to `public` schema)
--
-- Mirrors the terminal-state lock in `vehicleapp.fn_record_vehicle_activity`
-- directly on `vehicleapp.vehicles` via a BEFORE UPDATE trigger so non-superadmins
-- (portal_role <> 'SUPERADMIN' AND app_level < 90) cannot bypass the UI or RPC
-- via raw PostgREST PATCH requests:
--   1. `DISPOSED` -> any other status_code: blocked unless SUPERADMIN / APP_ADMIN (>= 90) / service_role.
--   2. `DECOMMISSIONED` -> any status_code other than `DECOMMISSIONED` or `DISPOSED`:
--      blocked unless SUPERADMIN / APP_ADMIN (>= 90) / service_role.
--   3. Non-status metadata edits (where `status_code` is unchanged) remain allowed
--      subject to existing RLS policies.
-- =============================================================================

CREATE OR REPLACE FUNCTION vehicleapp.fn_guard_vehicle_terminal_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vehicleapp, public
AS $$
DECLARE
  v_is_service boolean := (
    COALESCE(auth.role(), '') = 'service_role'
    OR (auth.uid() IS NULL AND COALESCE(auth.role(), '') = '' AND session_user = 'postgres')
  );
  v_portal_role text;
  v_app_level integer;
  v_is_super boolean := false;
BEGIN
  -- Only enforce when status_code actually changes out of a terminal state
  IF OLD.status_code IS NOT DISTINCT FROM NEW.status_code THEN
    RETURN NEW;
  END IF;

  IF OLD.status_code NOT IN ('DISPOSED', 'DECOMMISSIONED') THEN
    RETURN NEW;
  END IF;

  -- Allow service_role / direct postgres maintenance sessions
  IF v_is_service THEN
    RETURN NEW;
  END IF;

  v_portal_role := COALESCE(public.fn_current_user_role(), '');
  v_app_level := COALESCE(vehicleapp.fn_my_app_role_level(), 0);
  v_is_super := (v_portal_role = 'SUPERADMIN' OR v_app_level >= 90);

  IF v_is_super THEN
    RETURN NEW;
  END IF;

  IF OLD.status_code = 'DISPOSED' AND NEW.status_code IS DISTINCT FROM 'DISPOSED' THEN
    RAISE EXCEPTION 'ยานพาหนะ % อยู่ในสถานะจำหน่ายแล้ว เฉพาะผู้ดูแลระบบสูงสุดเท่านั้นที่สามารถเปลี่ยนสถานะได้',
      COALESCE(OLD.vehicle_code, OLD.id::text)
      USING ERRCODE = '42501';
  END IF;

  IF OLD.status_code = 'DECOMMISSIONED' AND COALESCE(NEW.status_code, '') NOT IN ('DECOMMISSIONED', 'DISPOSED') THEN
    RAISE EXCEPTION 'ยานพาหนะ % อยู่ในสถานะยุบสภาพรอจำหน่าย สามารถเปลี่ยนเป็นสถานะจำหน่ายได้เท่านั้น หากต้องการคืนสถานะปกติต้องให้ผู้ดูแลระบบสูงสุดดำเนินการ',
      COALESCE(OLD.vehicle_code, OLD.id::text)
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vehicles_terminal_status_guard ON vehicleapp.vehicles;
CREATE TRIGGER trg_vehicles_terminal_status_guard
  BEFORE UPDATE ON vehicleapp.vehicles
  FOR EACH ROW
  EXECUTE FUNCTION vehicleapp.fn_guard_vehicle_terminal_status();

-- Keep least-privilege function grants consistent with Migration 002
REVOKE ALL ON FUNCTION vehicleapp.fn_guard_vehicle_terminal_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION vehicleapp.fn_guard_vehicle_terminal_status() TO authenticated, service_role;
