/**
 * app/api/reviews/[id]/reply/route.ts — post a reply to a review.
 *
 * Phase 2 / Day 18: posts final_text via the platform's reply API (mock
 * postReply in mock mode), updates review_replies.status = posted, posted_at,
 * and reviews.status = replied. On failure, stores error_message.
 */

import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { postReply as googlePostReply } from "@/lib/integrations/google-business-profile";
import { postReply as facebookPostReply } from "@/lib/integrations/facebook-graph";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { text?: string };
  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ ok: false, error: "Reply text required" }, { status: 400 });
  }

  const store = await getStore();
  const businesses = await store.getBusinessesForUser(user.id);

  // Find the review.
  let review = null;
  let business = null;
  for (const b of businesses) {
    const found = (await store.listReviews(b.id)).find((r) => r.id === params.id);
    if (found) {
      review = found;
      business = b;
      break;
    }
  }
  if (!review || !business) {
    return NextResponse.json({ ok: false, error: "Review not found" }, { status: 404 });
  }

  // Post via the correct platform integration (mock postReply simulates success).
  const token = business.google_oauth_token_encrypted ?? "mock-token";
  const postResult =
    review.source === "google"
      ? await googlePostReply(review.external_review_id, text, token)
      : await facebookPostReply(
          review.external_review_id,
          text,
          business.facebook_oauth_token_encrypted ?? "mock-token"
        );

  // Update the reply row.
  let reply = await store.getReplyForReview(review.id);
  if (!reply) {
    reply = await store.createReply({ review_id: review.id, draft_text: text });
  }

  if (postResult.success) {
    await store.updateReply(reply.id, {
      final_text: text,
      posted_at: new Date().toISOString(),
      posted_by: "owner",
      status: "posted",
      error_message: null,
    });
    await store.updateReview(review.id, { status: "replied" });
    return NextResponse.json({ ok: true, posted_at: new Date().toISOString() });
  } else {
    await store.updateReply(reply.id, {
      status: "failed",
      error_message: postResult.error_message ?? "unknown error",
    });
    return NextResponse.json(
      { ok: false, error: postResult.error_message ?? "Post failed" },
      { status: 500 }
    );
  }
}