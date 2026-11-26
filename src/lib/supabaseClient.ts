import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
export const SUPABASE_PUBLISHABLE_KEY = String(
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || ''
).trim();
export const SUPABASE_SCHEMA = String(import.meta.env.VITE_SUPABASE_SCHEMA || 'vehicleapp').trim() || 'vehicleapp';

export const isSupabaseConfigured = Boolean(
  SUPABASE_URL &&
    SUPABASE_PUBLISHABLE_KEY &&
    !SUPABASE_URL.includes('<your-project-ref>') &&
    !SUPABASE_PUBLISHABLE_KEY.includes('<your-publishable-key>')
);

const FALLBACK_URL = 'https://placeholder.supabase.co';
const FALLBACK_KEY = 'sb_publishable_placeholder_not_configured';

/**
 * Security Architecture (Requirement 8 — Portal-Only Entry):
 * - Uses `db.schema = 'vehicleapp'` (dedicated schema on shared Portal SSO Supabase project).
 * - Uses `window.sessionStorage` instead of `localStorage` for Supabase Auth session persistence:
 *   * Refreshing an active tab launched from Portal SSO keeps the user signed in seamlessly.
 *   * Opening the Vehicle App URL directly in a new tab / bookmark has ZERO persisted session,
 *     strictly preventing direct-link bypass without a fresh Portal SSO handshake.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase: SupabaseClient<any, any, any> = createClient(
  SUPABASE_URL || FALLBACK_URL,
  SUPABASE_PUBLISHABLE_KEY || FALLBACK_KEY,
  {
    db: {
      schema: SUPABASE_SCHEMA,
    },
    auth: {
      flowType: 'pkce',
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      storage: typeof window !== 'undefined' ? window.sessionStorage : undefined,
      storageKey: 'vehicleapp_sb_session',
    },
  }
);
