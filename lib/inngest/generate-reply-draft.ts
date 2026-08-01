/**
 * lib/inngest/generate-reply-draft.ts
 *
 * Triggered by the `review.received` event (and manually). Calls
 * lib/ai/draft-reply.ts to produce an on-brand draft, stores it in
 * review_replies.draft_text, and sets reviews.status = 'draft_generated'.
 *
 * Also handles the locked auto-post rule: if the business has
 * auto_post_positive_reviews enabled AND the review is 4-5 stars, the draft is
 * posted automatically. 1-3 star reviews ALWAYS require manual approval, even
 * when auto-post is on (Product-Roadmap.md Phase 2 — not user-configurable).
 *
 * Manual-triggerable (Implementation-Plan §4):
 *   POST /api/dev/trigger?job=generate-reply-draft&review_id=...
 */

import { inngest, EVENTS } from "@/lib/inngest/client";
import { getStore } from "@/lib/db";
import { draftReply } from "@/lib/ai/draft-reply";
import { postReply as googlePostReply } from "@/lib/integrations/google-business-profile";
import { postReply as facebookPostReply } from "@/lib/integrations/facebook-graph";

/** Core logic, callable directly (manual trigger / fallback). */
export async function runGenerateReplyDraft(reviewId: string): Promise<void> {
  const store = await getStore();

  // Find the review (it belongs to a business; resolve via the local/supabase store).
  // The store interface lists reviews by business, so first locate the business by
  // searching connected businesses' reviews. Simpler: a dedicated accessor isn't on
  // the interface, so iterate businesses. For mock mode this is cheap.
  const businesses = await store.listConnectedBusinesses();
  let review = null as Awaited<ReturnType<typeof store.listReviews>>[number] | null;
  let business = null as (typeof businesses)[number] | null;
  for (const b of businesses) {
    const found = (await store.listReviews(b.id)).find((r) => r.id === reviewId);
    if (found) {
      review = found;
      business = b;
      break;
    }
  }
  if (!review || !business) {
    console.log(`[generate-reply-draft] review ${reviewId} not found`);
    return;
  }

  const result = await draftReply({
    reviewText: review.review_text ?? "",
    rating: review.rating,
    category: business.category,
    brandVoice: business.brand_voice_notes,
    reviewerName: review.reviewer_name,
    businessName: business.name,
  });

  // Store the draft.
  await store.createReply({ review_id: review.id, draft_text: result.draft });
  await store.updateReview(review.id, { status: "draft_generated" });

  // Locked auto-post rule: only 4-5★ when the toggle is on.
  const positiveEnough = review.rating >= 4;
  if (business.auto_post_positive_reviews && positiveEnough) {
    await autoPostIfEligible(review.id, business, result.draft);
  }
}

async function autoPostIfEligible(
  reviewId: string,
  business: { id: string },
  draftText: string
): Promise<void> {
  const store = await getStore();
  const review = (await store.listReviews(business.id)).find((r) => r.id === reviewId);
  if (!review) return;
  const token = "mock-token";
  const postResult =
    review.source === "google"
      ? await googlePostReply(review.external_review_id, draftText, token)
      : await facebookPostReply(review.external_review_id, draftText, token);

  const reply = await store.getReplyForReview(reviewId);
  if (!reply) return;
  if (postResult.success) {
    await store.updateReply(reply.id, {
      final_text: draftText,
      posted_at: new Date().toISOString(),
      posted_by: "auto",
      status: "posted",
      error_message: null,
    });
    await store.updateReview(reviewId, { status: "replied" });
  } else {
    await store.updateReply(reply.id, {
      status: "failed",
      error_message: postResult.error_message ?? "unknown error",
    });
  }
}

/** Inngest function registration. */
export const generateReplyDraftJob = inngest.createFunction(
  { id: "generate-reply-draft", name: "Generate AI reply draft" },
  [{ event: EVENTS.reviewReceived }, { event: EVENTS.manualGenerateDraft }],
  async ({ event }) => {
    const data = event?.data as { review_id?: string } | undefined;
    const reviewId = data?.review_id;
    if (!reviewId) return { ok: false, reason: "missing review_id" };
    await runGenerateReplyDraft(reviewId);
    return { ok: true };
  }
);