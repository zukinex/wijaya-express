/**
 * Supabase client access for Wijaya Express.
 *
 * The Supabase project does NOT exist yet — the operator creates a free
 * project later and supplies NEXT_PUBLIC_SUPABASE_URL and
 * NEXT_PUBLIC_SUPABASE_ANON_KEY. Until then the app must still build and
 * run: this module reports the backend as unconfigured and
 * `getSupabaseClient()` returns null instead of throwing.
 *
 * Only the anon key is ever used in the browser. The service-role key is
 * never present in this app.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface SupabaseConfigStatus {
  configured: boolean;
  /** Names of the env vars that are missing (empty when configured). */
  missing: string[];
}

const URL_VAR = "NEXT_PUBLIC_SUPABASE_URL";
const KEY_VAR = "NEXT_PUBLIC_SUPABASE_ANON_KEY";

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

/** True when both Supabase env vars are present and look usable. */
export function isSupabaseConfigured(): boolean {
  return getSupabaseConfigStatus().configured;
}

export function getSupabaseConfigStatus(): SupabaseConfigStatus {
  const missing: string[] = [];
  const url = readEnv(URL_VAR);
  const key = readEnv(KEY_VAR);
  if (!url || !/^https?:\/\//.test(url)) missing.push(URL_VAR);
  if (!key) missing.push(KEY_VAR);
  return { configured: missing.length === 0, missing };
}

let cachedClient: SupabaseClient | null = null;
let cachedKey: string | null = null;

/**
 * The shared Supabase client, or null when the backend is not configured
 * (env vars missing). Callers must handle null by showing the
 * "backend not configured" state — never call this and assume non-null.
 */
export function getSupabaseClient(): SupabaseClient | null {
  const status = getSupabaseConfigStatus();
  if (!status.configured) {
    return null;
  }
  // readEnv is guaranteed non-empty here.
  const url = readEnv(URL_VAR) as string;
  const key = readEnv(KEY_VAR) as string;
  if (cachedClient && cachedKey === `${url}|${key}`) {
    return cachedClient;
  }
  cachedClient = createClient(url, key);
  cachedKey = `${url}|${key}`;
  return cachedClient;
}

/** Test-only helper: drop the cached client so env changes take effect. */
export function __resetSupabaseClientForTests(): void {
  cachedClient = null;
  cachedKey = null;
}
