import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { vehicleService } from '@/services/vehicleService';
import { QUERY_KEYS } from '@/lib/queryClient';
import { clampMaxFileMb } from '@/services/driveBridgeService';
import type { AppSettingRow } from '@/types/vehicle.types';

export interface ParsedAppSettings {
  appDisplayName: string;
  warningDaysBefore: number;
  maxFileMb: number;
  defaultTheme: 'light' | 'dark';
  defaultProvince: string;
  dashboardTrackingLimit: number;
  dashboardRecentLimit: number;
  activitiesPageSize: number;
  notificationMaxItems: number;
  notifyMaintenanceStatus: boolean;
  reportHeaderOrg: string;
  reportHeaderSub: string;
  gasDriveBridgeUrl: string;
  activityFolderId: string;
  vesselLicenseFolderId: string;
  rawMap: Record<string, string>;
}

function parseIntClamped(raw: string | undefined, fallback: number, min: number, max: number): number {
  const trimmed = String(raw ?? '').trim();
  if (!/^\d+$/.test(trimmed)) return fallback;
  const n = Number(trimmed);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function parseAppSettings(rows: AppSettingRow[]): ParsedAppSettings {
  const rawMap: Record<string, string> = {};
  for (const r of rows) {
    rawMap[r.key] = r.value ?? '';
  }

  return {
    appDisplayName: rawMap.app_display_name?.trim() || 'ระบบต่อภาษีและใบอนุญาตยานพาหนะราชการ',
    warningDaysBefore: parseIntClamped(rawMap.warning_days_before, 45, 1, 365),
    maxFileMb: clampMaxFileMb(rawMap.max_file_mb, 10),
    defaultTheme: rawMap.default_theme?.trim().toLowerCase() === 'dark' ? 'dark' : 'light',
    defaultProvince: rawMap.default_province?.trim() || 'กรุงเทพมหานคร',
    dashboardTrackingLimit: parseIntClamped(rawMap.dashboard_tracking_limit, 15, 5, 100),
    dashboardRecentLimit: parseIntClamped(rawMap.dashboard_recent_limit, 5, 3, 50),
    activitiesPageSize: parseIntClamped(rawMap.activities_page_size, 10, 5, 100),
    notificationMaxItems: parseIntClamped(rawMap.notification_max_items, 30, 5, 100),
    notifyMaintenanceStatus: rawMap.notify_maintenance_status?.trim().toLowerCase() !== 'false',
    reportHeaderOrg: rawMap.report_header_org?.trim() || 'สำนักเทศกิจ กรุงเทพมหานคร',
    reportHeaderSub: rawMap.report_header_sub?.trim() || 'สำนักงานตรวจและบังคับการ',
    gasDriveBridgeUrl: rawMap.gas_drive_bridge_url?.trim() || '',
    activityFolderId: rawMap.activity_folder_id?.trim() || '',
    vesselLicenseFolderId: rawMap.vessel_license_folder_id?.trim() || '',
    rawMap,
  };
}

export function useAppSettings(enabled = true) {
  const query = useQuery({
    queryKey: QUERY_KEYS.settings,
    queryFn: vehicleService.listSettings,
    enabled,
    staleTime: 60_000,
  });

  const parsed = useMemo(() => parseAppSettings(query.data ?? []), [query.data]);

  return {
    ...query,
    settingsRows: query.data ?? [],
    settings: parsed,
  };
}
