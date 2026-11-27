import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/stores/useAuthStore';
import type {
  AppSettingRow,
  AuditLogRow,
  CronStatusInfo,
  NotificationReadRow,
  PortalPersonnelDirectoryRow,
  RecordActivityInput,
  RecordActivityResult,
  UpdateActivityInput,
  VehicleActivityRow,
  VehicleEnrichedRow,
  VehicleTypeRow,
  VehicleTypeUpsertInput,
  VehicleUpsertInput,
} from '@/types/vehicle.types';

function getCurrentActor(): { userId: string | null; actorName: string } {
  const { user, personnel } = useAuthStore.getState();
  return {
    userId: user?.id ?? null,
    actorName: personnel?.full_name || user?.username || 'ผู้ใช้งาน',
  };
}

function translatePgError(err: { code?: string; message?: string }, fallback: string): string {
  if (err?.code === '23503') {
    return 'ไม่สามารถลบรายการนี้ได้ เนื่องจากมียานพาหนะใช้งานประเภทนี้อยู่ — แนะนำให้กดปิดใช้งานแทน';
  }
  if (err?.code === '23505') {
    return 'รหัสประเภทยานพาหนะ (Code) นี้มีอยู่ในระบบแล้ว กรุณาใช้รหัสอื่น';
  }
  return err?.message || fallback;
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
      .order('sort_order', { ascending: true })
      .order('name_th', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as VehicleTypeRow[];
  },

  async listAllVehicleTypes(): Promise<VehicleTypeRow[]> {
    const { data, error } = await supabase
      .from('vehicle_types')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name_th', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as VehicleTypeRow[];
  },

  async saveVehicleType(input: VehicleTypeUpsertInput): Promise<VehicleTypeRow> {
    const normalizedCode = input.code.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    const normalizedName = input.name_th.trim();
    if (!normalizedCode || !normalizedName) {
      throw new Error('กรุณาระบุรหัส (Code) และชื่อประเภทยานพาหนะ (ภาษาไทย)');
    }

    if (input.is_default) {
      await supabase
        .from('vehicle_types')
        .update({ is_default: false })
        .eq('is_default', true);
    }

    const rowPayload = {
      code: normalizedCode,
      name_th: normalizedName,
      is_vessel: Boolean(input.is_vessel),
      default_caretaker_position: input.default_caretaker_position?.trim() || null,
      icon_name: input.icon_name?.trim() || (input.is_vessel ? 'fa-ship' : 'fa-car-side'),
      ...(input.sort_order != null ? { sort_order: input.sort_order } : {}),
      ...(input.is_active != null ? { is_active: input.is_active } : {}),
      ...(input.is_default != null ? { is_default: input.is_default } : {}),
    };

    if (input.id) {
      const { data, error } = await supabase
        .from('vehicle_types')
        .update(rowPayload)
        .eq('id', input.id)
        .select('*')
        .single();
      if (error) throw new Error(translatePgError(error, 'ไม่สามารถแก้ไขประเภทยานพาหนะได้'));
      const saved = data as VehicleTypeRow;
      await writeAuditLog('UPDATE_VEHICLE_TYPE', 'vehicle_types', saved.id, {
        code: saved.code,
        name_th: saved.name_th,
        is_vessel: saved.is_vessel,
      });
      return saved;
    }

    const { data: existing } = await supabase
      .from('vehicle_types')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1);
    const nextOrder = Number((existing?.[0] as { sort_order?: number } | undefined)?.sort_order ?? 0) + 1;

    const { data, error } = await supabase
      .from('vehicle_types')
      .insert({
        ...rowPayload,
        sort_order: input.sort_order ?? nextOrder,
        is_active: input.is_active ?? true,
        is_default: input.is_default ?? false,
      })
      .select('*')
      .single();
    if (error) throw new Error(translatePgError(error, 'ไม่สามารถเพิ่มประเภทยานพาหนะได้'));
    const saved = data as VehicleTypeRow;
    await writeAuditLog('CREATE_VEHICLE_TYPE', 'vehicle_types', saved.id, {
      code: saved.code,
      name_th: saved.name_th,
      is_vessel: saved.is_vessel,
    });
    return saved;
  },

  async saveVehicleTypesBatch(items: VehicleTypeUpsertInput[]): Promise<VehicleTypeRow[]> {
    const valid = items.filter((i) => i.code.trim() && i.name_th.trim());
    if (valid.length === 0) {
      throw new Error('กรุณากรอกข้อมูลประเภทยานพาหนะอย่างน้อย 1 รายการ');
    }

    const { data: existing } = await supabase
      .from('vehicle_types')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1);
    let nextOrder = Number((existing?.[0] as { sort_order?: number } | undefined)?.sort_order ?? 0) + 1;

    const rows = valid.map((item) => ({
      code: item.code.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_'),
      name_th: item.name_th.trim(),
      is_vessel: Boolean(item.is_vessel),
      default_caretaker_position: item.default_caretaker_position?.trim() || null,
      icon_name: item.icon_name?.trim() || (item.is_vessel ? 'fa-ship' : 'fa-car-side'),
      sort_order: nextOrder++,
      is_active: true,
      is_default: false,
    }));

    const { data, error } = await supabase.from('vehicle_types').insert(rows).select('*');
    if (error) throw new Error(translatePgError(error, 'ไม่สามารถเพิ่มประเภทยานพาหนะแบบหลายรายการได้'));
    const saved = (data ?? []) as VehicleTypeRow[];
    await writeAuditLog('BATCH_CREATE_VEHICLE_TYPES', 'vehicle_types', null, {
      count: saved.length,
      codes: saved.map((s) => s.code),
    });
    return saved;
  },

  async reorderVehicleTypes(orderedIds: string[]): Promise<void> {
    for (let i = 0; i < orderedIds.length; i++) {
      const { error } = await supabase
        .from('vehicle_types')
        .update({ sort_order: i + 1 })
        .eq('id', orderedIds[i]);
      if (error) throw new Error(`สลับลำดับไม่สำเร็จ: ${error.message}`);
    }
    await writeAuditLog('REORDER_VEHICLE_TYPES', 'vehicle_types', null, {
      ordered_ids: orderedIds,
    });
  },

  async toggleVehicleTypeActive(id: string, isActive: boolean): Promise<void> {
    const { error } = await supabase
      .from('vehicle_types')
      .update({
        is_active: isActive,
        ...(isActive ? {} : { is_default: false }),
      })
      .eq('id', id);
    if (error) throw new Error(error.message);
    await writeAuditLog('TOGGLE_VEHICLE_TYPE_ACTIVE', 'vehicle_types', id, { is_active: isActive });
  },

  async setDefaultVehicleType(id: string): Promise<void> {
    const { error: clearErr } = await supabase
      .from('vehicle_types')
      .update({ is_default: false })
      .eq('is_default', true);
    if (clearErr) throw new Error(clearErr.message);

    const { error } = await supabase
      .from('vehicle_types')
      .update({ is_default: true, is_active: true })
      .eq('id', id);
    if (error) throw new Error(error.message);
    await writeAuditLog('SET_DEFAULT_VEHICLE_TYPE', 'vehicle_types', id, {});
  },

  async deleteVehicleType(id: string, meta?: { code?: string; name_th?: string }): Promise<void> {
    const { error } = await supabase.from('vehicle_types').delete().eq('id', id);
    if (error) throw new Error(translatePgError(error, 'ไม่สามารถลบประเภทยานพาหนะได้'));
    await writeAuditLog('DELETE_VEHICLE_TYPE', 'vehicle_types', id, {
      code: meta?.code ?? null,
      name_th: meta?.name_th ?? null,
    });
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

  async updateVehicleAttachment(
    id: string,
    attachment: { attachment_folder_id: string | null; latest_file_url: string | null }
  ): Promise<void> {
    const { userId } = getCurrentActor();
    const { error } = await supabase
      .from('vehicles')
      .update({
        attachment_folder_id: attachment.attachment_folder_id,
        latest_file_url: attachment.latest_file_url,
        updated_by: userId,
      })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },

  async deleteVehicle(id: string, meta?: { vehicle_code?: string; vehicle_label?: string }): Promise<void> {
    const { error } = await supabase.from('vehicles').delete().eq('id', id);
    if (error) throw new Error(error.message);
    await writeAuditLog('DELETE_VEHICLE', 'vehicles', id, {
      vehicle_code: meta?.vehicle_code ?? null,
      vehicle_label: meta?.vehicle_label ?? null,
    });
  },

  async listCaretakerCandidates(params: {
    officeId?: string | null;
    departmentId?: string | null;
  }): Promise<PortalPersonnelDirectoryRow[]> {
    if (!params.departmentId && !params.officeId) return [];
    const { data, error } = await supabase.rpc('fn_list_caretaker_candidates', {
      p_office_id: params.officeId || null,
      p_department_id: params.departmentId || null,
    });
    if (error) throw new Error(error.message);
    return (data ?? []) as PortalPersonnelDirectoryRow[];
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

  async updateSettings(
    updates: Array<{ key: string; value: string; description?: string; setting_group?: string }>
  ): Promise<void> {
    if (updates.length === 0) return;
    const { userId } = getCurrentActor();
    for (const item of updates) {
      const { error } = await supabase.from('app_settings').upsert(
        {
          key: item.key,
          value: item.value,
          ...(item.description ? { description: item.description } : {}),
          ...(item.setting_group ? { setting_group: item.setting_group } : {}),
          updated_by: userId,
        },
        { onConflict: 'key' }
      );
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

  async getCronStatus(): Promise<CronStatusInfo> {
    const { data, error } = await supabase.rpc('fn_get_cron_status');
    if (error) throw new Error(error.message);
    return data as CronStatusInfo;
  },
};
