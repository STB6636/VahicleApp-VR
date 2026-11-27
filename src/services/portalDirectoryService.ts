import { supabase } from '@/lib/supabaseClient';
import { createPortalClient } from '@/lib/portalClient';
import type {
  PortalOrgUnitLevelRow,
  PortalOrgUnitRow,
  PortalPersonnelDirectoryRow,
} from '@/types/vehicle.types';

interface RawPortalOrgUnit {
  id: string;
  level_id?: string | null;
  level_no?: number | null;
  parent_id?: string | null;
  code?: string | null;
  name_th: string;
  short_name?: string | null;
  sort_order?: number | null;
  is_active?: boolean;
}

interface RawOrgUnitsApiResponse {
  success?: boolean;
  levels?: PortalOrgUnitLevelRow[];
  data?: RawPortalOrgUnit[];
}

/**
 * Resolves `level_no` (1..4) for `public.org_units` rows returned by Portal SSO
 * `GET /portal-api/org-units`, which sends `{ levels: org_unit_levels[], data: org_units[] }`
 * where each unit carries `level_id` rather than a denormalized `level_no` column.
 */
export function normalizePortalOrgUnits(
  payload: RawOrgUnitsApiResponse | null | undefined
): PortalOrgUnitRow[] {
  const units = Array.isArray(payload?.data) ? payload.data : [];
  if (units.length === 0) return [];

  const levelNoById = new Map<string, number>();
  for (const lvl of payload?.levels ?? []) {
    if (lvl?.id && Number.isFinite(Number(lvl.level_no))) {
      levelNoById.set(lvl.id, Number(lvl.level_no));
    }
  }

  // Fallback parent-depth inference if `levels` was omitted by a custom proxy
  const unitById = new Map(units.map((u) => [u.id, u]));
  const inferDepth = (unit: RawPortalOrgUnit): number => {
    let depth = 1;
    let cursor = unit.parent_id ?? null;
    const seen = new Set<string>([unit.id]);
    while (cursor && !seen.has(cursor) && depth < 4) {
      seen.add(cursor);
      const parent = unitById.get(cursor);
      if (!parent) break;
      depth += 1;
      cursor = parent.parent_id ?? null;
    }
    return depth;
  };

  return units.map((u) => {
    const resolvedLevel =
      (u.level_id ? levelNoById.get(u.level_id) : undefined) ??
      (Number.isFinite(Number(u.level_no)) && Number(u.level_no) > 0
        ? Number(u.level_no)
        : inferDepth(u));

    return {
      id: u.id,
      level_id: u.level_id ?? null,
      parent_id: u.parent_id ?? null,
      level_no: resolvedLevel,
      code: u.code ?? null,
      name_th: u.name_th,
      short_name: u.short_name ?? null,
      sort_order: u.sort_order ?? null,
      is_active: u.is_active,
    };
  });
}

async function getSessionAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? '';
}

export const portalDirectoryService = {
  async listOrgUnits(): Promise<PortalOrgUnitRow[]> {
    const token = await getSessionAccessToken();
    if (!token) return [];
    const client = createPortalClient(token);
    const res = (await client.getOrgUnits()) as RawOrgUnitsApiResponse;
    return normalizePortalOrgUnits(res);
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

  async listPositionNames(): Promise<string[]> {
    const token = await getSessionAccessToken();
    if (!token) return [];
    try {
      const client = createPortalClient(token);
      const res = (await client.getPositions()) as {
        success?: boolean;
        positions?: Array<{ name_th?: string; is_active?: boolean }>;
      };
      const names = (res?.positions ?? [])
        .filter((p) => p?.name_th && p.is_active !== false)
        .map((p) => String(p.name_th).trim());
      return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, 'th'));
    } catch {
      return [];
    }
  },
};
