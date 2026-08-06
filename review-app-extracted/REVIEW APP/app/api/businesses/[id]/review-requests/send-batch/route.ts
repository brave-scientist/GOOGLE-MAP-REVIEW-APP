/**
 * app/api/businesses/[id]/review-requests/send-batch/route.ts — bulk send.
 *
 * Used by RequestsManager after a paste-list parse or CSV upload preview is
 * confirmed. Accepts an array of contacts and creates a review_request for
 * each, then queues the send job for each.
 */

import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { runSendReviewRequest } from "@/lib/inngest/send-review-request";
import type { RequestChannel, RequestEntryMethod } from "@/lib/types";

interface BatchContact {
  name: string;
  contact: string;
  channel: "sms" | "email";
}

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
    contacts?: BatchContact[];
    entry_method?: RequestEntryMethod;
  };

  const contacts = body.contacts ?? [];
  const entryMethod: RequestEntryMethod = body.entry_method ?? "paste_list";

  if (!Array.isArray(contacts) || contacts.length === 0) {
    return NextResponse.json({ ok: false, error: "No contacts provided" }, { status: 400 });
  }

  const created = [];
  for (const c of contacts) {
    if (!c.name?.trim() || !c.contact?.trim()) continue;
    const request = await store.createReviewRequest({
      business_id: business.id,
      customer_name: c.name.trim(),
      customer_contact: c.contact.trim(),
      channel: c.channel as RequestChannel,
      source: "manual_upload",
      entry_method: entryMethod,
      status: "queued",
    });
    await runSendReviewRequest(request.id);
    created.push(request);
  }

  return NextResponse.json({ ok: true, count: created.length, requests: created });
}
