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
  activities: (vehicleId?: string) => ['vehicleapp', 'activities', vehicleId ?? 'all'] as const,
  settings: ['vehicleapp', 'settings'] as const,
  schemaHealth: ['vehicleapp', 'schema_health'] as const,
};
