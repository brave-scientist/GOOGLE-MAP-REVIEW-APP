/**
 * app/api/businesses/[id]/review-requests/parse-paste/route.ts
 *
 * Phase 3 / Day 22: parse pasted text into a preview using the lenient parser.
 * Returns parsed contacts + unparsed lines so the UI can show "Found N contacts"
 * before the owner confirms send.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { parsePasteList } from "@/lib/parsing/paste-list-parser";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const store = await getStore();
  const business = await store.getBusinessById(params.id);
  if (!business || business.owner_user_id !== user.id) {
    return NextResponse.json({ ok: false, error: "Business not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as { text?: string };
  const text = body.text ?? "";
  if (!text.trim()) {
    return NextResponse.json({ ok: false, error: "No text provided" }, { status: 400 });
  }

  const result = parsePasteList(text);
  return NextResponse.json({
    ok: true,
    contacts: result.contacts,
    unparsed: result.unparsed,
    total: result.contacts.length,
  });
}