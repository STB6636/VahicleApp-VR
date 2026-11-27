import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/stores/useAuthStore';
import type {
  AppSettingRow,
  AuditLogRow,
  NotificationReadRow,
  RecordActivityInput,
  RecordActivityResult,
  UpdateActivityInput,
  VehicleActivityRow,
  VehicleEnrichedRow,
  VehicleTypeRow,
  VehicleUpsertInput,
} from '@/types/vehicle.types';

function getCurrentActor(): { userId: string | null; actorName: string } {
  const { user, personnel } = useAuthStore.getState();
  return {
    userId: user?.id ?? null,
    actorName: personnel?.full_name || user?.username || 'ผู้ใช้งาน',
  };
}

async function writeAuditLog(
  action: string,
  entityType: string,
  entityId: string | null,
  payload: Record<string, unknown> = {}
): Promise<void> {
  const { userId, actorName } = getCurrentActor();
  try {
    await supabase.from('audit_logs').insert({
      actor_user_id: userId,
      actor_name: actorName,
      action,
      entity_type: entityType,
      entity_id: entityId,
      payload,
    });
  } catch {
    // Non-blocking audit log fallback
  }
}

export const vehicleService = {
  async listVehicles(): Promise<VehicleEnrichedRow[]> {
    const { data, error } = await supabase
      .from('v_vehicles_enriched')
      .select('*')
      .order('current_expiry_date', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as VehicleEnrichedRow[];
  },

  async listVehicleTypes(): Promise<VehicleTypeRow[]> {
    const { data, error } = await supabase
      .from('vehicle_types')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as VehicleTypeRow[];
  },

  async createVehicle(input: VehicleUpsertInput): Promise<{ id: string; vehicle_code: string }> {
    const { userId } = getCurrentActor();
    const { data, error } = await supabase
      .from('vehicles')
      .insert({
        ...input,
        created_by: userId,
        updated_by: userId,
      })
      .select('id, vehicle_code')
      .single();
    if (error) throw new Error(error.message);
    const created = data as { id: string; vehicle_code: string };
    await writeAuditLog('CREATE_VEHICLE', 'vehicles', created.id, {
      vehicle_code: created.vehicle_code,
      license_plate: input.license_plate,
      vessel_name: input.vessel_name,
      status_code: input.status_code,
    });
    return created;
  },

  async updateVehicle(
    id: string,
    input: VehicleUpsertInput
  ): Promise<{ id: string; vehicle_code: string }> {
    const { userId } = getCurrentActor();
    const { data, error } = await supabase
      .from('vehicles')
      .update({
        ...input,
        updated_by: userId,
      })
      .eq('id', id)
      .select('id, vehicle_code')
      .single();
    if (error) throw new Error(error.message);
    const updated = data as { id: string; vehicle_code: string };
    await writeAuditLog('UPDATE_VEHICLE', 'vehicles', updated.id, {
      vehicle_code: updated.vehicle_code,
      license_plate: input.license_plate,
      vessel_name: input.vessel_name,
      status_code: input.status_code,
    });
    return updated;
  },

  async deleteVehicle(id: string, meta?: { vehicle_code?: string; vehicle_label?: string }): Promise<void> {
    const { error } = await supabase.from('vehicles').delete().eq('id', id);
    if (error) throw new Error(error.message);
    await writeAuditLog('DELETE_VEHICLE', 'vehicles', id, {
      vehicle_code: meta?.vehicle_code ?? null,
      vehicle_label: meta?.vehicle_label ?? null,
    });
  },

  async listRecentActivities(limit = 100, vehicleId?: string): Promise<VehicleActivityRow[]> {
    let query = supabase
      .from('vehicle_activities')
      .select('*')
      .order('recorded_at', { ascending: false })
      .limit(limit);
    if (vehicleId) {
      query = query.eq('vehicle_id', vehicleId);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as VehicleActivityRow[];
  },

  async recordActivity(input: RecordActivityInput): Promise<RecordActivityResult> {
    const { data, error } = await supabase.rpc('fn_record_vehicle_activity', {
      p_vehicle_ids: input.vehicle_ids,
      p_activity_type: input.activity_type,
      p_document_no: input.document_no || null,
      p_start_date: input.start_date || null,
      p_expiry_date: input.expiry_date || null,
      p_location: input.location || null,
      p_details: input.details || null,
      p_file_url: input.file_url || null,
      p_file_name: input.file_name || null,
    });
    if (error) throw new Error(error.message);
    return data as RecordActivityResult;
  },

  async updateActivity(id: string, input: UpdateActivityInput): Promise<VehicleActivityRow> {
    const { userId, actorName } = getCurrentActor();
    const { data, error } = await supabase
      .from('vehicle_activities')
      .update({
        document_no: input.document_no?.trim() || null,
        location: input.location?.trim() || null,
        details: input.details?.trim() || null,
        updated_by_user_id: userId,
        updated_by_name: actorName,
      })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    await writeAuditLog('UPDATE_ACTIVITY', 'vehicle_activities', id, {
      document_no: input.document_no,
      location: input.location,
    });
    return data as VehicleActivityRow;
  },

  async listNotificationReads(): Promise<NotificationReadRow[]> {
    const { userId } = getCurrentActor();
    if (!userId) return [];
    const { data, error } = await supabase
      .from('notification_reads')
      .select('*')
      .eq('user_id', userId)
      .order('read_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as NotificationReadRow[];
  },

  async markNotificationsRead(refKeys: string[]): Promise<void> {
    const { userId } = getCurrentActor();
    const unique = Array.from(new Set(refKeys.filter(Boolean)));
    if (!userId || unique.length === 0) return;

    const rows = unique.map((ref_key) => ({
      user_id: userId,
      ref_key,
    }));
    const { error } = await supabase
      .from('notification_reads')
      .upsert(rows, { onConflict: 'user_id,ref_key', ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  },

  async listSettings(): Promise<AppSettingRow[]> {
    const { data, error } = await supabase
      .from('app_settings')
      .select('*')
      .order('setting_group', { ascending: true })
      .order('key', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as AppSettingRow[];
  },

  async updateSettings(updates: Array<{ key: string; value: string }>): Promise<void> {
    if (updates.length === 0) return;
    const { userId } = getCurrentActor();
    for (const item of updates) {
      const { error } = await supabase
        .from('app_settings')
        .update({
          value: item.value,
          updated_by: userId,
        })
        .eq('key', item.key);
      if (error) throw new Error(`บันทึกค่า ${item.key} ไม่สำเร็จ: ${error.message}`);
    }
    await writeAuditLog('UPDATE_SETTINGS', 'app_settings', null, {
      keys: updates.map((u) => u.key),
    });
  },

  async refreshVehicleStatuses(): Promise<number> {
    const { data, error } = await supabase.rpc('fn_refresh_vehicle_statuses');
    if (error) throw new Error(error.message);
    const updated = Number(data ?? 0);
    await writeAuditLog('REFRESH_VEHICLE_STATUSES', 'vehicles', null, { updated_count: updated });
    return updated;
  },

  async listAuditLogs(limit = 100): Promise<AuditLogRow[]> {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []) as AuditLogRow[];
  },

  async getSchemaHealth(): Promise<{
    schema: string;
    healthy: boolean;
    vehicle_types_count: number;
    vehicles_count: number;
    activities_count: number;
    settings_count: number;
    checked_at: string;
  }> {
    const { data, error } = await supabase.rpc('fn_schema_health');
    if (error) throw new Error(error.message);
    return data;
  },
};
