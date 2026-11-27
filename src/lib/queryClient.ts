import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export const QUERY_KEYS = {
  vehicles: ['vehicleapp', 'vehicles'] as const,
  vehicleTypes: ['vehicleapp', 'vehicle_types'] as const,
  activitiesAll: ['vehicleapp', 'activities'] as const,
  activities: (vehicleId?: string, limit?: number) =>
    ['vehicleapp', 'activities', vehicleId ?? 'all', limit ?? 'default'] as const,
  settings: ['vehicleapp', 'settings'] as const,
  schemaHealth: ['vehicleapp', 'schema_health'] as const,
  notificationReads: ['vehicleapp', 'notification_reads'] as const,
  auditLogs: ['vehicleapp', 'audit_logs'] as const,
  portalOrgUnits: ['portal', 'org_units'] as const,
  portalPersonnel: ['portal', 'personnel'] as const,
};
