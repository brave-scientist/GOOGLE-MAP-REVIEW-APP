/**
 * app/api/auth/active-business/route.ts — sets the active business location ID in a cookie.
 * Used for multi-location switching in the enterprise plan.
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const ACTIVE_BUSINESS_COOKIE = "rr_active_business";

export async function POST(req: NextRequest) {
  try {
    const { businessId } = await req.json();
    if (!businessId) {
      return NextResponse.json({ ok: false, error: "Missing businessId" }, { status: 400 });
    }

    const cookieStore = cookies();
    (cookieStore as any).set(ACTIVE_BUSINESS_COOKIE, businessId, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365, // 1 year
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: "Internal Server Error" }, { status: 500 });
  }
}
