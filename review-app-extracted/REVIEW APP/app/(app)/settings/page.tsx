/**
 * app/(app)/settings/page.tsx — business settings.
 *
 * Phase 4 (Day 17): per-business auto-post toggle (off by default; 4-5★ only,
 * locked rule). Phase 5 (Day 25): message template editor + notification prefs.
 */

import { getCurrentUser, getActiveBusiness } from "@/lib/auth";
import { getStore } from "@/lib/db";
import SettingsForm from "@/components/SettingsForm";
import { redirect } from "next/navigation";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  const store = await getStore();
  const business = await getActiveBusiness();

  if (!business) {
    redirect("/onboarding");
  }

  return <SettingsForm business={business} />;
}
