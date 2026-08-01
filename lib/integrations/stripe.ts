/**
 * lib/integrations/stripe.ts
 *
 * Per Implementation-Plan §1: all Stripe API calls live here. The billing
 * webhook handler (app/api/webhooks/stripe/route.ts) and billing UI call these.
 *
 * Mock mode (USE_MOCKS=true, default): simulates the ENTIRE subscription
 * lifecycle in the local database directly — creates a subscriptions row on
 * "checkout," handles plan changes + cancellation in DB. No real Stripe API is
 * contacted. This makes the billing UI fully testable without a Stripe account.
 *
 * Real mode (USE_MOCKS=false + STRIPE_SECRET_KEY): real Stripe Checkout +
 * Billing SDK calls. Stripe SDK is already a dependency.
 *
 * Locked pricing (Product-Roadmap.md §0, do not change):
 *   Starter $29/mo, Pro $59/mo, $0.05/request metered overage, 14-day trial.
 */

import Stripe from "stripe";
import { getStore } from "@/lib/db";
import { PLAN_PRICES, TRIAL_DAYS, type SubscriptionPlan } from "@/lib/types";

const USE_MOCKS = process.env.USE_MOCKS !== "false";

let _stripe: Stripe | null = null;
function stripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  _stripe = new Stripe(key, { apiVersion: "2024-06-20" });
  return _stripe;
}

export interface CheckoutOptions {
  businessId: string;
  plan: SubscriptionPlan;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutResult {
  url: string; // redirect URL (mock mode: in-app simulated checkout page)
  sessionId: string;
}

/**
 * Create a Checkout Session for the given plan with a 14-day trial.
 */
export async function createCheckoutSession(
  opts: CheckoutOptions
): Promise<CheckoutResult> {
  if (USE_MOCKS) {
    const sessionId = `mock-cs-${opts.businessId}-${Date.now()}`;
    return {
      sessionId,
      url: `/billing/mock-checkout?session_id=${sessionId}&plan=${opts.plan}&business_id=${opts.businessId}`,
    };
  }

  // ---- REAL implementation -------------------------------------------------
  const priceId =
    opts.plan === "starter"
      ? process.env.STRIPE_PRICE_ID_STARTER
      : process.env.STRIPE_PRICE_ID_PRO;
  if (!priceId) throw new Error(`STRIPE_PRICE_ID_${opts.plan.toUpperCase()} not set`);
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: { trial_period_days: TRIAL_DAYS },
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    client_reference_id: opts.businessId,
  });
  return {
    sessionId: session.id,
    url: session.url ?? opts.cancelUrl,
  };
}

/**
 * Finalize a checkout (mock "checkout.session.completed" equivalent).
 * Creates/updates the subscription row.
 */
export async function finalizeCheckout(
  businessId: string,
  plan: SubscriptionPlan
): Promise<void> {
  const store = await getStore();
  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS);
  const periodEnd = new Date();
  periodEnd.setDate(periodEnd.getDate() + 30);

  await store.upsertSubscription({
    business_id: businessId,
    stripe_customer_id: USE_MOCKS ? `mock-cus-${businessId}` : null,
    stripe_subscription_id: USE_MOCKS ? `mock-sub-${businessId}-${Date.now()}` : null,
    plan,
    status: "trialing",
    current_period_end: periodEnd.toISOString(),
    trial_ends_at: trialEnd.toISOString(),
  });
}

/**
 * Change a subscription's plan (proration handled by Stripe in real mode).
 */
export async function changePlan(
  businessId: string,
  newPlan: SubscriptionPlan
): Promise<void> {
  const store = await getStore();
  const existing = await store.getSubscription(businessId);
  if (!existing) throw new Error(`no subscription for business ${businessId}`);

  if (USE_MOCKS) {
    await store.upsertSubscription({
      ...existing,
      plan: newPlan,
      status: existing.status === "trialing" ? "trialing" : "active",
    });
    return;
  }

  // ---- REAL implementation -------------------------------------------------
  if (!existing.stripe_subscription_id) {
    throw new Error("cannot change plan: missing stripe_subscription_id");
  }
  const newPriceId =
    newPlan === "starter"
      ? process.env.STRIPE_PRICE_ID_STARTER!
      : process.env.STRIPE_PRICE_ID_PRO!;
  const sub = await stripe().subscriptions.retrieve(existing.stripe_subscription_id);
  const itemId = sub.items.data[0]?.id;
  if (!itemId) throw new Error("subscription has no line item");
  await stripe().subscriptions.update(existing.stripe_subscription_id, {
    items: [{ id: itemId, price: newPriceId }],
    proration_behavior: "create_prorations",
  });
  await store.upsertSubscription({ ...existing, plan: newPlan });
}

/**
 * Cancel a subscription immediately (self-serve, no support ticket required).
 */
export async function cancelSubscription(businessId: string): Promise<void> {
  const store = await getStore();
  const existing = await store.getSubscription(businessId);
  if (!existing) return;

  if (USE_MOCKS) {
    await store.upsertSubscription({ ...existing, status: "canceled" });
    return;
  }

  // ---- REAL implementation -------------------------------------------------
  if (existing.stripe_subscription_id) {
    await stripe().subscriptions.cancel(existing.stripe_subscription_id);
  }
  await store.upsertSubscription({ ...existing, status: "canceled" });
}

/**
 * Report metered overage usage ($0.05/request beyond plan allotment).
 * In mock mode this is a no-op (no real metered billing to report to).
 */
export async function reportOverageUsage(
  businessId: string,
  units: number
): Promise<void> {
  if (USE_MOCKS || units <= 0) return;
  const store = await getStore();
  const existing = await store.getSubscription(businessId);
  if (!existing?.stripe_subscription_id) return;

  // ---- REAL implementation -------------------------------------------------
  // Find the metered overage item on the subscription and create a usage record.
  const sub = await stripe().subscriptions.retrieve(existing.stripe_subscription_id);
  const metered = sub.items.data.find((i) => i.plan.usage_type === "metered");
  if (metered) {
    await stripe().subscriptionItems.createUsageRecord(metered.id, {
      quantity: units,
      action: "increment",
      timestamp: "now" as unknown as number,
    });
  }
}

/** Locked price lookup for display in the UI. */
export function priceForPlan(plan: SubscriptionPlan): number {
  return plan === "starter" ? PLAN_PRICES.starter : PLAN_PRICES.pro;
}

/**
 * Stripe Customer Portal URL (real mode only). Mock mode returns the in-app
 * billing page since there is no real portal.
 */
export async function createPortalSession(
  businessId: string,
  returnUrl: string
): Promise<string> {
  if (USE_MOCKS) return returnUrl;
  const store = await getStore();
  const sub = await store.getSubscription(businessId);
  if (!sub?.stripe_customer_id) throw new Error("no stripe customer");
  const session = await stripe().billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: returnUrl,
  });
  return session.url;
}