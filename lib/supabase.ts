import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase client, or null when unconfigured.
 *
 * Returning null rather than throwing is deliberate: with no env vars the
 * site falls back to sample data and says so in the banner. A throw here
 * would make a fresh clone fail to boot, and the usual fix for that is a
 * hardcoded fallback URL — which is exactly how a sibling project ended up
 * shipping a dead Supabase host to production.
 */
let cached: SupabaseClient | null | undefined;

export function getSupabase(): SupabaseClient | null {
  if (cached !== undefined) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  cached = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  return cached;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/**
 * True when the site is serving invented awards.
 *
 * Single source of truth for the disclaimer banner. It is derived from
 * configuration rather than passed down from a query result, so the layout
 * can render the banner above the nav without duplicating the data fetch —
 * and so no page can accidentally render sample data without it.
 */
export function isSampleMode(): boolean {
  return !isSupabaseConfigured();
}
