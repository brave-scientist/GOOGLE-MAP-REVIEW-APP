/**
 * lib/supabase/server.ts — Supabase server/client helpers (real-mode only).
 *
 * These helpers are used by SupabaseStore and the real Supabase Auth flow.
 * In mock mode (default for this build) they are not called — lib/auth.ts uses
 * the LocalStore's cookie session instead. Implementation Plan §1 requires
 * lib/supabase/ to hold client + server helpers; this file is that location.
 *
 * WARNING: this module is a no-op import in mock mode; importing it does not
 * require Supabase credentials to be present.
 */

import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/** Shape of the cookie tuples Supabase SSR passes to setAll. */
interface SupabaseCookieSet {
  name: string;
  value: string;
  options: {
    path?: string;
    maxAge?: number;
    domain?: string;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: "strict" | "lax" | "none";
  };
}

export function createServerSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase server client requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }
  const cookieStore = cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet: SupabaseCookieSet[]) {
        try {
          toSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // setAll can throw in a Server Component where cookies are read-only.
          // Safe to ignore when middleware refreshes the session.
        }
      },
    },
  });
}

/** Service-role client used by background jobs (bypasses RLS). */
export function createServiceRoleClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Supabase service-role client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
