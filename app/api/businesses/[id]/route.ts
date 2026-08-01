/**
 * app/api/businesses/[id]/route.ts — get + update a single business.
 *
 * PATCH /api/businesses/:id — update fields (brand_voice_notes, timezone,
 * auto_post_positive_reviews, review_request_template, notification prefs).
 */

import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type { Business } from "@/lib/types";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const store = await getStore();
  const business = await store.getBusinessById(params.id);
  if (!business || business.owner_user_id !== user.id) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, business });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const store = await getStore();
  const business = await store.getBusinessById(params.id);
  if (!business || business.owner_user_id !== user.id) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as Partial<Business>;
  // Allow only safe updatable fields (string keys only).
  const allowed: ReadonlySet<Extract<keyof Business, string>> = new Set([
    "name",
    "brand_voice_notes",
    "timezone",
    "auto_post_positive_reviews",
    "review_request_template",
    "notify_new_review_email",
    "notify_new_review_sms",
    "daily_digest",
    "google_review_link",
  ]);
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (allowed.has(key as Extract<keyof Business, string>)) {
      patch[key] = value;
    }
  }

  const updated = await store.updateBusiness(
    business.id,
    patch as Partial<Business>
  );
  return NextResponse.json({ ok: true, business: updated });
}