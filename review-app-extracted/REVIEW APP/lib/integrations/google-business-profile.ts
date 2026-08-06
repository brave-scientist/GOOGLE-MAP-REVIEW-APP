/**
 * lib/integrations/google-business-profile.ts
 *
 * Per Implementation-Plan §1: all Google Business Profile API calls live here.
 * Route handlers and Inngest jobs call these functions; they never call the
 * Google API directly.
 *
 * Mock mode (USE_MOCKS=true, default): fetchReviews returns realistic varied
 * mock reviews; postReply logs and simulates success. Swapping to real means
 * filling GOOGLE_* env vars — see MOCK-TO-REAL.md.
 */

import type { BusinessCategory } from "@/lib/types";
import { generateMockReviews, type MockReview } from "@/lib/integrations/mock-data";

const USE_MOCKS = process.env.USE_MOCKS !== "false";

export interface GoogleReview {
  external_review_id: string;
  reviewer_name: string;
  rating: number;
  review_text: string;
  review_created_at: string;
}

export interface PostReplyResult {
  success: boolean;
  external_reply_id?: string;
  error_message?: string;
}

/**
 * Fetch reviews for a Google Business Profile location.
 * Real signature: (locationId, accessToken).
 * In mock mode the locationId/category hint is used to seed plausible reviews.
 */
export async function fetchReviews(
  locationId: string,
  accessToken: string,
  category: BusinessCategory = "other"
): Promise<GoogleReview[]> {
  if (USE_MOCKS || !accessToken) {
    // Simulate latency + return a fresh varied batch each poll.
    await delay(150);
    const batch = generateMockReviews(randomBetween(1, 4), category, "google");
    return batch.map(normalize);
  }

  // ---- REAL implementation (active when USE_MOCKS=false + real token) ------
  // Google Business Profile API: GET accounts/{account}/locations/{location}/reviews
  const accountId = ""; // resolved by caller in real mode from businesses.google_business_profile_account_id
  const url = `https://mybusiness.googleapis.com/v4/accounts/${accountId}/locations/${locationId}/reviews`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`google fetchReviews failed: ${res.status}`);
  }
  const json = (await res.json()) as { reviews?: unknown[] };
  return (json.reviews ?? []).map((r) => mapGoogleReview(r as Record<string, unknown>));
}

/**
 * Post a reply to a Google review.
 * Real signature: (reviewId, replyText, accessToken).
 */
export async function postReply(
  reviewId: string,
  replyText: string,
  accessToken: string
): Promise<PostReplyResult> {
  if (USE_MOCKS || !accessToken) {
    await delay(120);
    // Per kickoff §2.2: log the "post" and simulate a successful live response.
    // reviewId only — never the review text or reviewer PII in logs.
    console.log(`[mock:google] postReply simulated for review ${reviewId}`);
    return { success: true, external_reply_id: `mock-gbp-reply-${Date.now()}` };
  }

  // ---- REAL implementation -------------------------------------------------
  // POST accounts/{account}/locations/{location}/reviews/{reviewId}/reply
  throw new Error(
    "google postReply real path requires review name resolution — see MOCK-TO-REAL.md"
  );
}

// Helpers

function normalize(r: MockReview): GoogleReview {
  return { ...r };
}

function mapGoogleReview(r: Record<string, unknown>): GoogleReview {
  return {
    external_review_id: String(r.reviewId ?? r.name ?? ""),
    reviewer_name: String((r as { reviewer?: { displayName?: string } }).reviewer?.displayName ?? "Anonymous"),
    rating: Number((r as { starRating?: string }).starRating === "FIVE" ? 5 : 3),
    review_text: String(r.comment ?? ""),
    review_created_at: String(r.createTime ?? new Date().toISOString()),
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}