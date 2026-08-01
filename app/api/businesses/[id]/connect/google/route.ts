/**
 * app/api/businesses/[id]/connect/google/route.ts — mock Google Business Profile connect.
 *
 * Phase 1 endpoint: POST /api/businesses/:id/connect/google
 *
 * Mock mode (kickoff §2.2): instead of a real OAuth redirect, the client posts
 * the chosen mock location from MOCK_GOOGLE_LOCATIONS. We store structurally
 * valid identifiers on the businesses row. Real mode would handle the OAuth
 * callback at /api/webhooks/google-oauth-callback.
 */

import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { MOCK_GOOGLE_LOCATIONS } from "@/lib/integrations/mock-data";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    account_id?: string;
    place_id?: string;
  };

  // Validate against the seeded mock locations.
  const location = MOCK_GOOGLE_LOCATIONS.find(
    (l) => l.account_id === body.account_id && l.place_id === body.place_id
  );
  if (!location) {
    return NextResponse.json(
      { ok: false, error: "Invalid mock location selection" },
      { status: 400 }
    );
  }

  const store = await getStore();
  const business = await store.getBusinessById(params.id);
  if (!business || business.owner_user_id !== user.id) {
    return NextResponse.json({ ok: false, error: "Business not found" }, { status: 404 });
  }

  const updated = await store.updateBusiness(business.id, {
    google_business_profile_account_id: location.account_id,
    google_place_id: location.place_id,
    // Structurally-valid fake "encrypted" token (mock mode only).
    google_oauth_token_encrypted: `mock-enc-token-${Date.now()}`,
    google_oauth_refresh_token_encrypted: `mock-enc-refresh-${Date.now()}`,
    google_review_link: `https://g.page/r/mock-${business.id}/review`,
  });

  return NextResponse.json({ ok: true, business: updated });
}