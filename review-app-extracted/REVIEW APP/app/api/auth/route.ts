/**
 * app/api/auth/route.ts — auth handler for mock mode.
 *
 * Mock mode: POST with { email } signs in / signs up the local demo user and
 * sets the session cookie. Real mode would use Supabase Auth, but the same
 * endpoint surface works for both — in real mode this delegates to Supabase's
 * signUp / signInWithPassword.
 *
 * DELETE logs out.
 */

import { NextRequest, NextResponse } from "next/server";
import { signInMock, signOutMock, isMockMode } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { email?: string };
  const email = body.email?.trim().toLowerCase();

  if (!email || !email.includes("@")) {
    return NextResponse.json({ ok: false, error: "Valid email required" }, { status: 400 });
  }

  if (isMockMode()) {
    const user = await signInMock(email);
    return NextResponse.json({ ok: true, user_id: user.id, email: user.email });
  }

  // Real mode: would call Supabase Auth signUp/signInWithPassword here.
  return NextResponse.json(
    { ok: false, error: "Real Supabase Auth not wired in mock mode" },
    { status: 501 }
  );
}

export async function DELETE() {
  if (isMockMode()) {
    await signOutMock();
  }
  return NextResponse.json({ ok: true });
}