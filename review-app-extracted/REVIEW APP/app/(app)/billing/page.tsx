/**
 * app/(app)/billing/page.tsx — billing & subscription management.
 *
 * Server component: fetches the business's subscription and request usage,
 * then renders the BillingManager client component for plan changes / cancel.
 *
 * Phase 5 / Week 6: simulated subscription lifecycle (mock Stripe).
 */

import { getCurrentUser, getActiveBusiness } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { redirect } from "next/navigation";
import BillingManager from "@/components/BillingManager";

// Expanded pricing for high MRR.
const STARTER_PRICE = 29;
const PRO_PRICE = 59;
const ENTERPRISE_PRICE = 249;
const OVERAGE_RATE = 0.05;
const TRIAL_DAYS = 14;
const STARTER_LIMIT = 100;
const PRO_LIMIT = 300;
const ENTERPRISE_LIMIT = 2000;

export default async function BillingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const store = await getStore();
  const business = await getActiveBusiness();

  if (!business) {
    redirect("/onboarding");
  }

  const subscription = await store.getSubscription(business.id);
  const requestsThisMonth = await store.countRequestsThisMonth(business.id);

  // Determine plan / status / limits.
  const plan = subscription?.plan ?? "starter";
  const status = subscription?.status ?? "none";
  const currentPeriodEnd = subscription?.current_period_end ?? null;
  const trialEndsAt = subscription?.trial_ends_at ?? null;

  const monthlyLimit = plan === "enterprise" ? ENTERPRISE_LIMIT : plan === "pro" ? PRO_LIMIT : STARTER_LIMIT;
  const overage = Math.max(0, requestsThisMonth - monthlyLimit);

  return (
    <BillingManager
      businessId={business.id}
      businessName={business.name}
      plan={plan}
      status={status}
      currentPeriodEnd={currentPeriodEnd}
      trialEndsAt={trialEndsAt}
      requestsThisMonth={requestsThisMonth}
      monthlyLimit={monthlyLimit}
      overage={overage}
      overageRate={OVERAGE_RATE}
      starterPrice={STARTER_PRICE}
      proPrice={PRO_PRICE}
      enterprisePrice={ENTERPRISE_PRICE}
      trialDays={TRIAL_DAYS}
    />
  );
}
