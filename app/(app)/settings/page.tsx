/**
 * app/(app)/settings/page.tsx — business settings.
 *
 * Phase 4 (Day 17): per-business auto-post toggle (off by default; 4-5★ only,
 * locked rule). Phase 5 (Day 25): message template editor + notification prefs.
 */

import { getCurrentUser } from "@/lib/auth";
import { getStore } from "@/lib/db";
import SettingsForm from "@/components/SettingsForm";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  const store = await getStore();
  const businesses = await store.getBusinessesForUser(user!.id);
  const business = businesses[0]!;

  return <SettingsForm business={business} />;
}