/**
 * app/api/billing/checkout/route.ts — start a checkout (simulated in mock mode).
 *
 * In mock mode, finalizes the subscription directly and returns the billing URL.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { finalizeCheckout } from "@/lib/integrations/stripe";
import type { SubscriptionPlan } from "@/lib/types";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { plan?: SubscriptionPlan; business_id?: string };
  const plan = body.plan;
  if (!plan || (plan !== "starter" && plan !== "pro")) {
    return NextResponse.json({ ok: false, error: "Valid plan required" }, { status: 400 });
  }

  const store = await getStore();
  const business = body.business_id
    ? await store.getBusinessById(body.business_id)
    : (await store.getBusinessesForUser(user.id))[0];
  if (!business || business.owner_user_id !== user.id) {
    return NextResponse.json({ ok: false, error: "Business not found" }, { status: 404 });
  }

  await finalizeCheckout(business.id, plan);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
  return NextResponse.json({ ok: true, url: `${appUrl}/billing?status=success` });
}