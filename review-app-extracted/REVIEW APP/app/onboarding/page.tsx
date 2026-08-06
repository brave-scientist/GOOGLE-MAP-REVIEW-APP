/**
 * app/onboarding/page.tsx — renders the onboarding form.
 *
 * Lives OUTSIDE the (app) route group so the app layout's business-existence
 * guard doesn't create a redirect loop. Has its own auth guard.
 *
 * Server component: guards auth + redirects to /dashboard if the user already
 * has a business (Day 6 requirement: "on first login, if no business exists
 * for owner_user_id, redirect to onboarding form").
 */

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getStore } from "@/lib/db";
import OnboardingForm from "@/components/OnboardingForm";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const store = await getStore();
  const businesses = await store.getBusinessesForUser(user.id);

  // If the user already has a business with a connected platform, skip onboarding.
  const hasConnected = businesses.some(
    (b) => b.google_business_profile_account_id || b.facebook_page_id
  );
  if (hasConnected) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-ink">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <OnboardingForm />
      </div>
    </div>
  );
}