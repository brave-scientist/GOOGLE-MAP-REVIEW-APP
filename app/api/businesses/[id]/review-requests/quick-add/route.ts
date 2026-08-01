/**
 * app/api/businesses/[id]/review-requests/quick-add/route.ts — quick-add (primary path).
 *
 * Phase 3 / Day 21: single manual add. Two required fields (name + phone),
 * email optional. Immediately queues the send job (no batch confirmation for a
 * single add). Mobile-first, large touch targets.
 */

import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { runSendReviewRequest } from "@/lib/inngest/send-review-request";
import type { RequestChannel } from "@/lib/types";

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

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    phone?: string;
    email?: string;
  };

  const name = body.name?.trim();
  const phone = body.phone?.trim();
  const email = body.email?.trim();

  if (!name) {
    return NextResponse.json({ ok: false, error: "Name required" }, { status: 400 });
  }

  // Determine contact + channel: phone (SMS) is primary; email is fallback.
  let contact: string;
  let channel: RequestChannel;
  if (phone && phone.replace(/\D/g, "").length >= 10) {
    contact = phone.replace(/\D/g, "");
    channel = "sms";
  } else if (email && email.includes("@")) {
    contact = email;
    channel = "email";
  } else {
    return NextResponse.json(
      { ok: false, error: "Valid phone or email required" },
      { status: 400 }
    );
  }

  const request = await store.createReviewRequest({
    business_id: business.id,
    customer_name: name,
    customer_contact: contact,
    channel,
    source: "manual_upload",
    entry_method: "quick_add",
    status: "queued",
  });

  // Immediately send (single add — no batch confirmation needed).
  await runSendReviewRequest(request.id);

  return NextResponse.json({ ok: true, request });
}