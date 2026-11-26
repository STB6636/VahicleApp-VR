import { supabase } from '@/lib/supabaseClient';
import type {
  AppSettingRow,
  VehicleActivityRow,
  VehicleEnrichedRow,
  VehicleTypeRow,
} from '@/types/vehicle.types';

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

  async listRecentActivities(limit = 20): Promise<VehicleActivityRow[]> {
    const { data, error } = await supabase
      .from('vehicle_activities')
      .select('*')
      .order('recorded_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []) as VehicleActivityRow[];
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
