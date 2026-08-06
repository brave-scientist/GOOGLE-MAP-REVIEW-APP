/**
 * app/api/billing/manage/route.ts — change plan + cancel subscription.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { changePlan, cancelSubscription } from "@/lib/integrations/stripe";
import type { SubscriptionPlan } from "@/lib/types";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    action?: "change_plan" | "cancel";
    plan?: SubscriptionPlan;
  };

  const store = await getStore();
  const businesses = await store.getBusinessesForUser(user.id);
  const business = businesses[0];
  if (!business) return NextResponse.json({ ok: false, error: "No business found" }, { status: 404 });

  if (body.action === "change_plan") {
    if (!body.plan || (body.plan !== "starter" && body.plan !== "pro")) {
      return NextResponse.json({ ok: false, error: "Valid plan required" }, { status: 400 });
    }
    await changePlan(business.id, body.plan);
    return NextResponse.json({ ok: true, plan: body.plan });
  }

  if (body.action === "cancel") {
    await cancelSubscription(business.id);
    return NextResponse.json({ ok: true, status: "canceled" });
  }

  return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
}