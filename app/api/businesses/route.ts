/**
 * app/api/businesses/route.ts — create + list businesses.
 *
 * Phase 1 endpoints (Product-Roadmap.md):
 *   POST /api/businesses                  — create business record
 *   GET  /api/businesses                  — list businesses for the current user
 *
 * Both require an authenticated session (lib/auth.getCurrentUser).
 */

import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type { BusinessCategory } from "@/lib/types";

const VALID_CATEGORIES: BusinessCategory[] = [
  "restaurant",
  "salon",
  "dental",
  "retail",
  "contractor",
  "other",
];

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const store = await getStore();
  const businesses = await store.getBusinessesForUser(user.id);
  return NextResponse.json({ ok: true, businesses });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    category?: BusinessCategory;
    timezone?: string;
    brand_voice_notes?: string;
  };

  const name = body.name?.trim();
  const category = body.category;
  const timezone = body.timezone ?? "America/New_York";

  if (!name) {
    return NextResponse.json({ ok: false, error: "Business name required" }, { status: 400 });
  }
  if (!category || !VALID_CATEGORIES.includes(category)) {
    return NextResponse.json({ ok: false, error: "Valid category required" }, { status: 400 });
  }

  const store = await getStore();
  const business = await store.createBusiness({
    owner_user_id: user.id,
    name,
    category,
    timezone,
    brand_voice_notes: body.brand_voice_notes ?? null,
  });

  return NextResponse.json({ ok: true, business });
}