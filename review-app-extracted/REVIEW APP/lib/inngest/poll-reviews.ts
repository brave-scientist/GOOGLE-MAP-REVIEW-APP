/**
 * lib/inngest/poll-reviews.ts
 *
 * Scheduled Inngest job: runs every 20 minutes (locked interval), iterates
 * every connected business, pulls reviews from Google + Facebook via the
 * lib/integrations/* functions, and upserts into the reviews table using
 * external_review_id for dedup (never duplicates a platform review).
 *
 * Manual-triggerable two ways (Implementation-Plan §4):
 *   1. POST /api/dev/trigger?job=poll-reviews  -> calls runPollReviews()
 *   2. Inngest DevServer UI at /api/inngest.
 */

import { inngest, EVENTS, triggerJob } from "@/lib/inngest/client";
import { getStore } from "@/lib/db";
import { fetchReviews } from "@/lib/integrations/google-business-profile";
import { fetchPageRatings } from "@/lib/integrations/facebook-graph";
import { REVIEW_POLL_INTERVAL_MINUTES } from "@/lib/types";

/** Core logic, callable directly (manual trigger / fallback). */
export async function runPollReviews(businessId?: string): Promise<void> {
  const store = await getStore();

  const connected = await store.listConnectedBusinesses();
  const targets = businessId
    ? connected.filter((b) => b.id === businessId)
    : connected;

  for (const business of targets) {
    if (business.google_place_id || business.google_business_profile_account_id) {
      const token = business.google_oauth_token_encrypted ?? "mock-token";
      const reviews = await fetchReviews(
        business.google_place_id ?? business.google_business_profile_account_id ?? "",
        token,
        business.category
      );
      for (const r of reviews) {
        const created = await store.upsertReview({
          business_id: business.id,
          source: "google",
          external_review_id: r.external_review_id,
          reviewer_name: r.reviewer_name,
          rating: r.rating,
          review_text: r.review_text,
          review_created_at: r.review_created_at,
          status: "new",
        });
        // upsertReview dedupes; if it returned a row whose fetched_at is within
        // the last few seconds, treat it as newly created and fire review.received.
        if (Date.now() - new Date(created.fetched_at).getTime() < 5000) {
          await triggerJob(EVENTS.reviewReceived, {
            review_id: created.id,
            business_id: business.id,
          });
        }
      }
    }

    if (business.facebook_page_id) {
      const token = business.facebook_oauth_token_encrypted ?? "mock-token";
      const ratings = await fetchPageRatings(
        business.facebook_page_id,
        token,
        business.category
      );
      for (const r of ratings) {
        const created = await store.upsertReview({
          business_id: business.id,
          source: "facebook",
          external_review_id: r.external_review_id,
          reviewer_name: r.reviewer_name,
          rating: r.rating,
          review_text: r.review_text,
          review_created_at: r.review_created_at,
          status: "new",
        });
        if (Date.now() - new Date(created.fetched_at).getTime() < 5000) {
          await triggerJob(EVENTS.reviewReceived, {
            review_id: created.id,
            business_id: business.id,
          });
        }
      }
    }
  }
}

/**
 * Inngest function registration. In Inngest v3, triggers are plain config
 * objects ({ event } or { cron }), passed as the second argument array.
 */
export const pollReviewsJob = inngest.createFunction(
  { id: "poll-reviews", name: "Poll reviews from Google + Facebook" },
  [
    { cron: `*/${REVIEW_POLL_INTERVAL_MINUTES} * * * *` },
    { event: EVENTS.manualPollReviews },
  ],
  async ({ event }) => {
    const businessId = (event?.data as { business_id?: string } | undefined)?.business_id;
    await runPollReviews(businessId);
    return { ok: true };
  }
);