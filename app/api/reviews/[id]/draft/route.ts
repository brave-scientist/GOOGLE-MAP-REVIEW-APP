/**
 * app/api/reviews/[id]/draft/route.ts — generate or regenerate an AI draft.
 *
 * Calls lib/ai/draft-reply.ts with the review + business brand voice, stores
 * the draft in review_replies, and sets reviews.status = draft_generated.
 */

import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { draftReply } from "@/lib/ai/draft-reply";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const store = await getStore();

  // Find the review + its business to pass brand voice to the draft engine.
  const businesses = await store.getBusinessesForUser(user.id);
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

  // Generate the draft directly (synchronous, fast — rule-based in mock mode).
  const result = await draftReply({
    reviewText: review.review_text ?? "",
    rating: review.rating,
    category: business.category,
    brandVoice: business.brand_voice_notes,
    reviewerName: review.reviewer_name,
    businessName: business.name,
  });

  await store.createReply({ review_id: review.id, draft_text: result.draft });
  await store.updateReview(review.id, { status: "draft_generated" });

  return NextResponse.json({ ok: true, draft: result.draft, source: result.source });
}