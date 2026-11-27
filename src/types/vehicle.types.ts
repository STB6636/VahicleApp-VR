export type VehicleStatusCode =
  | 'NORMAL'
  | 'WARNING'
  | 'EXPIRED'
  | 'MAINTENANCE'
  | 'MAINTENANCE_WARNING'
  | 'MAINTENANCE_EXPIRED'
  | 'DECOMMISSIONED'
  | 'DISPOSED';

export type ActivityTypeCode =
  | 'TAX_RENEWAL'
  | 'MAINTENANCE_SEND'
  | 'MAINTENANCE_COMPLETE'
  | 'DECOMMISSION'
  | 'DISPOSE'
  | 'RESTORE_NORMAL';

export interface VehicleTypeRow {
  id: string;
  code: string;
  name_th: string;
  is_vessel: boolean;
  default_caretaker_position: string | null;
  icon_name: string;
  sort_order: number;
  is_active: boolean;
  is_default?: boolean;
}

export interface VehicleTypeUpsertInput {
  id?: string;
  code: string;
  name_th: string;
  is_vessel: boolean;
  default_caretaker_position: string | null;
  icon_name: string;
  sort_order?: number;
  is_active?: boolean;
  is_default?: boolean;
}

export interface CronStatusInfo {
  installed: boolean;
  active: boolean;
  jobid?: number | null;
  jobname: string;
  schedule: string | null;
}

export interface VehicleEnrichedRow {
  id: string;
  vehicle_code: string;
  vehicle_type_id: string;
  vehicle_type_code: string;
  vehicle_type_name: string;
  vehicle_type_sort_order?: number | null;
  is_vessel: boolean;
  vehicle_type_icon: string;
  license_plate: string | null;
  province: string | null;
  vessel_name: string | null;
  vessel_license_no: string | null;
  vehicle_label: string;
  brand: string | null;
  model: string | null;
  model_year: number | null;
  engine_cc: number | null;
  price: number | null;
  acquisition_date: string | null;
  disposal_date: string | null;
  current_expiry_date: string;
  days_until_expiry: number | null;
  office_id: string | null;
  office_name: string | null;
  department_id: string | null;
  department_name: string | null;
  division_id: string | null;
  division_name: string | null;
  caretaker_personnel_id: string | null;
  caretaker_name: string | null;
  caretaker_position_display: string | null;
  caretaker_position: string | null;
  caretaker_level: string | null;
  status_code: VehicleStatusCode;
  computed_status_code: VehicleStatusCode;
  is_under_maintenance: boolean;
  attachment_folder_id: string | null;
  latest_file_url: string | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

export interface VehicleUpsertInput {
  vehicle_type_id: string;
  license_plate: string | null;
  province: string | null;
  vessel_name: string | null;
  vessel_license_no: string | null;
  brand: string | null;
  model: string | null;
  model_year: number | null;
  engine_cc: number | null;
  price: number | null;
  acquisition_date: string | null;
  disposal_date: string | null;
  current_expiry_date: string;
  office_id: string | null;
  department_id: string | null;
  division_id: string | null;
  caretaker_personnel_id: string | null;
  status_code: VehicleStatusCode;
  is_under_maintenance: boolean;
  attachment_folder_id?: string | null;
  latest_file_url?: string | null;
  remarks: string | null;
}

export interface VehicleActivityRow {
  id: string;
  activity_code: string;
  vehicle_id: string;
  activity_type: ActivityTypeCode;
  activity_label_th: string;
  document_no: string | null;
  start_date: string | null;
  expiry_date: string | null;
  location: string | null;
  details: string | null;
  file_url: string | null;
  file_name: string | null;
  previous_status: VehicleStatusCode | null;
  new_status: VehicleStatusCode | null;
  recorded_by_user_id: string | null;
  recorded_by_name: string;
  updated_by_user_id: string | null;
  updated_by_name: string | null;
  recorded_at: string;
  updated_at: string;
}

export interface RecordActivityInput {
  vehicle_ids: string[];
  activity_type: ActivityTypeCode;
  document_no?: string | null;
  start_date?: string | null;
  expiry_date?: string | null;
  location?: string | null;
  details?: string | null;
  file_url?: string | null;
  file_name?: string | null;
}

export interface RecordActivityResult {
  success: boolean;
  updated_count: number;
  message: string;
}

export interface UpdateActivityInput {
  document_no: string | null;
  location: string | null;
  details: string | null;
}

export interface AppSettingRow {
  key: string;
  value: string;
  description: string;
  setting_group: string;
  updated_at: string;
}

export interface NotificationReadRow {
  id: string;
  user_id: string;
  ref_key: string;
  read_at: string;
}

export interface AuditLogRow {
  id: string;
  actor_user_id: string | null;
  actor_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface PortalOrgUnitLevelRow {
  id: string;
  level_no: number;
  code?: string | null;
  name_th?: string | null;
}

export interface PortalOrgUnitRow {
  id: string;
  level_id?: string | null;
  parent_id: string | null;
  level_no: number;
  code?: string | null;
  name_th: string;
  short_name?: string | null;
  sort_order?: number | null;
  is_active?: boolean;
}

export interface PortalPersonnelDirectoryRow {
  id: string;
  full_name: string;
  prefix_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  position_name?: string | null;
  position_level_name?: string | null;
  position_display?: string | null;
  office_id?: string | null;
  office_name?: string | null;
  department_id?: string | null;
  department_name?: string | null;
  division_id?: string | null;
  division_name?: string | null;
  status?: string | null;
  status_name?: string | null;
  allows_account_provision?: boolean | null;
}

export interface DriveUploadResult {
  url: string;
  folderId: string;
  fileName: string;
}

export interface DriveTestResult {
  ok: boolean;
  folderName?: string;
  folderId?: string;
  message: string;
}
