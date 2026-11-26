import { PortalSsoClient } from '@/lib/portal-sso-sdk';
import { SUPABASE_URL } from '@/lib/supabaseClient';

export const PORTAL_APP_CODE = String(import.meta.env.VITE_APP_CODE || 'VEHICLE_APP').trim().toUpperCase();

export const PORTAL_API_URL = String(
  import.meta.env.VITE_PORTAL_API_URL || (SUPABASE_URL ? `${SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/portal-api` : '')
).trim();

export const PORTAL_HOME_URL = String(import.meta.env.VITE_PORTAL_URL || '').trim();

export function createPortalClient(accessToken?: string): PortalSsoClient {
  return new PortalSsoClient({
    portalApiUrl: PORTAL_API_URL || 'https://placeholder.supabase.co/functions/v1/portal-api',
    appCode: PORTAL_APP_CODE,
    accessToken,
  });
}

/**
 * Extracts `sso_token` safely from either standard query string (?sso_token=...)
 * or HashRouter URL (#/sso-callback?sso_token=...).
 */
export function extractSsoTokenFromLocation(search: string, hash: string): string {
  const fromSearch = new URLSearchParams(search || '').get('sso_token');
  if (fromSearch && fromSearch.trim()) return fromSearch.trim();

  if (hash && hash.includes('?')) {
    const hashQuery = hash.slice(hash.indexOf('?') + 1);
    const fromHash = new URLSearchParams(hashQuery).get('sso_token');
    if (fromHash && fromHash.trim()) return fromHash.trim();
  }

  return '';
}

/**
 * Removes `sso_token` from both URL search params and HashRouter hash query string
 * while preserving unrelated query parameters and hash paths.
 */
export function stripSsoTokenFromUrl(href: string): string {
  const url = new URL(href, 'http://localhost');
  url.searchParams.delete('sso_token');

  let cleanHash = url.hash || '';
  if (cleanHash.includes('?')) {
    const qIdx = cleanHash.indexOf('?');
    const hashPath = cleanHash.slice(0, qIdx);
    const hashParams = new URLSearchParams(cleanHash.slice(qIdx + 1));
    hashParams.delete('sso_token');
    const remaining = hashParams.toString();
    cleanHash = remaining ? `${hashPath}?${remaining}` : hashPath;
  }

  const remainingSearch = url.searchParams.toString();
  return `${url.pathname}${remainingSearch ? `?${remainingSearch}` : ''}${cleanHash}`;
}
