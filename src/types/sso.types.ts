export type PortalCoreRole = 'SUPERADMIN' | 'ADMIN' | 'USER';

export interface PortalAppPermission {
  role_code: string;
  role_name_th: string;
  hierarchy_level: number;
}

export interface PortalPersonnelSummary {
  id: string;
  full_name?: string;
  prefix_name?: string;
  first_name?: string;
  last_name?: string;
  position_name?: string;
  position_level_name?: string;
  position_display?: string;
  office_id?: string | null;
  office_name?: string | null;
  department_id?: string | null;
  department_name?: string | null;
  division_id?: string | null;
  division_name?: string | null;
  photo_path?: string | null;
  email?: string | null;
  phone_number?: string | null;
}

export interface PortalSsoUser {
  id: string;
  username: string;
  email: string | null;
  role: PortalCoreRole;
  personnel_id?: string | null;
}

export interface PortalSsoExchangeResponse {
  success: boolean;
  user: PortalSsoUser;
  personnel: PortalPersonnelSummary | null;
  app_permission: PortalAppPermission | null;
  otp_hash?: string | null;
}

export interface PortalMeResponse {
  success: boolean;
  user: PortalSsoUser;
  personnel: PortalPersonnelSummary | null;
  app_permission: PortalAppPermission | null;
}
