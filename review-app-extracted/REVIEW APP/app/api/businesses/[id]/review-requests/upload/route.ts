/**
 * app/api/businesses/[id]/review-requests/upload/route.ts — CSV upload.
 *
 * Phase 3 / Day 23: accepts a CSV file (multipart/form-data, field "file"),
 * parses it leniently (handles header rows, quoted fields, mixed columns),
 * and returns a preview of contacts for the owner to confirm before send.
 *
 * Expected columns (any order, case-insensitive): name, phone, email.
 * If a header row is present, it's auto-detected and skipped.
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

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ ok: false, error: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "No file uploaded" }, { status: 400 });
  }

  const text = await file.text();
  if (!text.trim()) {
    return NextResponse.json({ ok: false, error: "Empty file" }, { status: 400 });
  }

  // Reuse the lenient paste-list parser — it handles CSV rows, tab-separated
  // rows, and free-form lines equally well.
  const result = parsePasteList(text);

  return NextResponse.json({
    ok: true,
    contacts: result.contacts,
    unparsed: result.unparsed,
    total: result.contacts.length,
  });
}
