import { supabase } from '@/lib/supabaseClient';
import { createPortalClient } from '@/lib/portalClient';
import type { PortalOrgUnitRow, PortalPersonnelDirectoryRow } from '@/types/vehicle.types';

async function getSessionAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? '';
}

export const portalDirectoryService = {
  async listOrgUnits(): Promise<PortalOrgUnitRow[]> {
    const token = await getSessionAccessToken();
    if (!token) return [];
    const client = createPortalClient(token);
    const res = (await client.getOrgUnits()) as {
      success?: boolean;
      data?: PortalOrgUnitRow[];
    };
    return Array.isArray(res?.data) ? res.data : [];
  },

  async listPersonnel(): Promise<PortalPersonnelDirectoryRow[]> {
    const token = await getSessionAccessToken();
    if (!token) return [];
    const client = createPortalClient(token);
    const res = (await client.getPersonnel()) as {
      success?: boolean;
      data?: PortalPersonnelDirectoryRow[];
    };
    return Array.isArray(res?.data) ? res.data : [];
  },
};
