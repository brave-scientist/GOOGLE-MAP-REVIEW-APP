"use client";

/**
 * components/BillingManager.tsx — billing UI (client component).
 *
 * Shows current plan, trial status, next billing date, request usage vs. plan
 * limit, overage cost, and self-serve change-plan + cancel buttons.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SubscriptionPlan, SubscriptionStatus } from "@/lib/types";

export default function BillingManager({
  businessId,
  businessName,
  plan,
  status,
  currentPeriodEnd,
  trialEndsAt,
  requestsThisMonth,
  monthlyLimit,
  overage,
  overageRate,
  starterPrice,
  proPrice,
  enterprisePrice,
  trialDays,
}: {
  businessId: string;
  businessName: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus | "none";
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  requestsThisMonth: number;
  monthlyLimit: number;
  overage: number;
  overageRate: number;
  starterPrice: number;
  proPrice: number;
  enterprisePrice: number;
  trialDays: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  async function startCheckout(newPlan: SubscriptionPlan) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: newPlan, business_id: businessId }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Checkout failed");
      // In mock mode, the URL is an in-app page; redirect to it.
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setBusy(false);
    }
  }

  async function changePlan(newPlan: SubscriptionPlan) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "change_plan", plan: newPlan }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Plan change failed");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Plan change failed");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Cancel failed");
      setConfirmCancel(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setBusy(false);
    }
  }

  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

  const isTrial = status === "trialing";
  const isCanceled = status === "canceled";

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-cream">Billing</h1>
        <p className="mt-1 text-sm text-cream-dim">{businessName}</p>
      </div>

      {/* Current plan card */}
      <div className="rounded-xl border border-cream/10 bg-ink-2 p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-mono text-xs uppercase tracking-wide text-brass-light">
              Current plan
            </div>
            <div className="mt-1 font-display text-2xl font-bold capitalize text-cream">
              {plan} — ${plan === "starter" ? starterPrice : plan === "pro" ? proPrice : enterprisePrice}/mo
            </div>
          </div>
          <span
            className={`rounded px-3 py-1 text-sm font-medium capitalize ${
              isTrial
                ? "bg-brass/15 text-brass-light"
                : isCanceled
                  ? "bg-coral/15 text-coral"
                  : "bg-green-500/15 text-green-400"
            }`}
          >
            {status}
          </span>
        </div>

        {isTrial && trialEndsAt && (
          <p className="mt-3 text-sm text-cream-dim">
            Trial ends {fmtDate(trialEndsAt)}. Your card will be charged ${plan === "starter" ? starterPrice : plan === "pro" ? proPrice : enterprisePrice}/mo
            on that date unless you cancel.
          </p>
        )}
        {currentPeriodEnd && !isTrial && (
          <p className="mt-3 text-sm text-cream-dim">
            Next billing date: {fmtDate(currentPeriodEnd)}
          </p>
        )}
        {isCanceled && (
          <p className="mt-3 text-sm text-coral">
            Your subscription is canceled. Reactivate by choosing a plan below.
          </p>
        )}
      </div>

      {/* Usage */}
      <div className="rounded-xl border border-cream/10 bg-ink-2 p-6">
        <h2 className="mb-3 font-display text-lg font-semibold text-cream">
          Review request usage
        </h2>
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-3xl font-semibold text-cream">{requestsThisMonth}</span>
          <span className="text-sm text-cream-dim">/ {monthlyLimit} included this month</span>
        </div>
        {overage > 0 && (
          <p className="mt-2 text-sm text-coral">
            {overage} overage requests × ${overageRate.toFixed(2)} = ${(overage * overageRate).toFixed(2)} extra
          </p>
        )}
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink-3">
          <div
            className="h-full bg-brass transition-all"
            style={{ width: `${Math.min(100, (requestsThisMonth / monthlyLimit) * 100)}%` }}
          />
        </div>
      </div>

      {/* Plan options */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Starter */}
        <div className={`rounded-xl border p-5 ${plan === "starter" && !isCanceled ? "border-brass bg-brass/5" : "border-cream/10 bg-ink-2"}`}>
          <div className="font-display text-lg font-bold text-cream">Starter</div>
          <div className="font-mono text-2xl font-semibold text-cream">${starterPrice}<span className="text-sm text-cream-dim">/mo</span></div>
          <ul className="mt-3 space-y-1 text-sm text-cream-dim">
            <li>1 location</li>
            <li>Google reviews only</li>
            <li>100 requests/mo included</li>
            <li>Email review requests</li>
          </ul>
          {plan !== "starter" || isCanceled ? (
            <button
              onClick={() => (isCanceled || !status || status === "none" ? startCheckout("starter") : changePlan("starter"))}
              disabled={busy}
              className="mt-4 w-full rounded-lg border border-brass py-2 text-sm font-medium text-brass-light transition hover:bg-brass hover:text-ink disabled:opacity-50"
            >
              {isCanceled || !status ? "Start trial" : "Switch to Starter"}
            </button>
          ) : (
            <div className="mt-4 text-center text-sm text-green-400">✓ Current plan</div>
          )}
        </div>

        {/* Pro */}
        <div className={`rounded-xl border p-5 ${plan === "pro" && !isCanceled ? "border-brass bg-brass/5" : "border-cream/10 bg-ink-2"}`}>
          <div className="font-display text-lg font-bold text-cream">Pro</div>
          <div className="font-mono text-2xl font-semibold text-cream">${proPrice}<span className="text-sm text-cream-dim">/mo</span></div>
          <ul className="mt-3 space-y-1 text-sm text-cream-dim">
            <li>1 location</li>
            <li>Google + Facebook reviews</li>
            <li>300 requests/mo included</li>
            <li>SMS + email review requests</li>
            <li>Priority support</li>
          </ul>
          {plan !== "pro" || isCanceled ? (
            <button
              onClick={() => (isCanceled || !status || status === "none" ? startCheckout("pro") : changePlan("pro"))}
              disabled={busy}
              className="mt-4 w-full rounded-lg bg-brass py-2 text-sm font-semibold text-ink transition hover:brightness-110 disabled:opacity-50"
            >
              {isCanceled || !status ? "Start trial" : "Upgrade to Pro"}
            </button>
          ) : (
            <div className="mt-4 text-center text-sm text-green-400">✓ Current plan</div>
          )}
        </div>

        {/* Enterprise */}
        <div className={`rounded-xl border p-5 ${plan === "enterprise" && !isCanceled ? "border-brass bg-brass/5" : "border-cream/10 bg-ink-2"}`}>
          <div className="font-display text-lg font-bold text-cream text-brass-light">Enterprise</div>
          <div className="font-mono text-2xl font-semibold text-cream">${enterprisePrice}<span className="text-sm text-cream-dim">/mo</span></div>
          <ul className="mt-3 space-y-1 text-sm text-cream-dim">
            <li className="font-bold text-cream">Multi-location enabled</li>
            <li>Google + Facebook reviews</li>
            <li>2,000 requests/mo included</li>
            <li>SMS + email review requests</li>
            <li>24/7 dedicated account manager</li>
          </ul>
          {plan !== "enterprise" || isCanceled ? (
            <button
              onClick={() => (isCanceled || !status || status === "none" ? startCheckout("enterprise") : changePlan("enterprise"))}
              disabled={busy}
              className="mt-4 w-full rounded-lg bg-brass-light py-2 text-sm font-semibold text-ink transition hover:brightness-110 disabled:opacity-50"
            >
              {isCanceled || !status ? "Start trial" : "Upgrade to Enterprise"}
            </button>
          ) : (
            <div className="mt-4 text-center text-sm text-green-400">✓ Current plan</div>
          )}
        </div>
      </div>

      {/* Cancel */}
      {!isCanceled && status !== "none" && (
        <div className="rounded-xl border border-cream/10 bg-ink-2 p-5">
          {confirmCancel ? (
            <div>
              <p className="mb-3 text-sm text-cream">
                Are you sure? Your subscription will end immediately. You can re-subscribe anytime.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={cancel}
                  disabled={busy}
                  className="rounded-lg bg-coral px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
                >
                  {busy ? "Canceling…" : "Yes, cancel my subscription"}
                </button>
                <button
                  onClick={() => setConfirmCancel(false)}
                  className="rounded-lg border border-cream/20 px-4 py-2 text-sm text-cream-dim transition hover:text-cream"
                >
                  Keep my plan
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmCancel(true)}
              className="text-sm text-coral underline hover:no-underline"
            >
              Cancel subscription
            </button>
          )}
        </div>
      )}

      {error && <p className="text-sm text-coral">{error}</p>}

      <p className="text-xs text-cream-dim">
        {trialDays}-day free trial. Card required. Cancel anytime — no support ticket needed.
      </p>
    </div>
  );
}