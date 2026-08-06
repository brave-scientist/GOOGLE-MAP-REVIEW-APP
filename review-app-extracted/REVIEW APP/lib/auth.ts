/**
 * lib/auth.ts — session helpers for both mock mode and real Supabase mode.
 *
 * Mock mode (default): a signed-ish cookie "rr_demo_user" holds the user id.
 *   - getCurrentUser() reads the cookie and resolves from the LocalStore.
 *   - signIn(email) writes the cookie (used by /signup and /login in mock mode).
 *
 * Real mode (USE_MOCKS=false + Supabase creds): delegates to Supabase Auth via
 *   createServerSupabaseClient(). The same getCurrentUser() surface is used by
 *   all route handlers and server components.
 */

import { cookies } from "next/headers";
import { getStore } from "@/lib/db";
import type { User } from "@/lib/types";

import type { Business } from "@/lib/types";

const MOCK_COOKIE = "rr_demo_user";
const ACTIVE_BUSINESS_COOKIE = "rr_active_business";
const useMocks = process.env.USE_MOCKS !== "false";

export async function getCurrentUser(): Promise<User | null> {
  const store = await getStore();
  if (useMocks) {
    return store.getCurrentUser();
  }
  // Real mode: SupabaseStore.getCurrentUser resolves via the server client.
  return store.getCurrentUser();
}

export async function getActiveBusiness(): Promise<Business | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const store = await getStore();
  const businesses = await store.getBusinessesForUser(user.id);
  if (businesses.length === 0) return null;

  const cookieStore = cookies();
  const activeId = cookieStore.get(ACTIVE_BUSINESS_COOKIE)?.value;
  if (activeId) {
    const found = businesses.find((b) => b.id === activeId);
    if (found) return found;
  }
  return businesses[0] ?? null;
}

export function setActiveBusinessId(id: string) {
  const cookieStore = cookies();
  (cookieStore as any).set(ACTIVE_BUSINESS_COOKIE, id, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });
}

export async function signInMock(email: string): Promise<User> {
  const store = await getStore();
  const user = await store.signIn(email);
  const cookieStore = cookies();
  (cookieStore as unknown as { set: (name: string, value: string, opts?: object) => void }).set(
    MOCK_COOKIE,
    user.id,
    {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    }
  );
  return user;
}

export async function signOutMock(): Promise<void> {
  const store = await getStore();
  await store.signOut();
  const cookieStore = cookies();
  (cookieStore as unknown as { delete: (name: string) => void }).delete(MOCK_COOKIE);
}

/** True when the app is running in mock mode (no real credentials required). */
export function isMockMode(): boolean {
  return useMocks;
}