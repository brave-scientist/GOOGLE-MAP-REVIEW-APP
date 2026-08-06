/**
 * lib/integrations/facebook-graph.ts
 *
 * Per Implementation-Plan §1: all Facebook Graph API calls live here.
 * Route handlers and Inngest jobs call these functions only.
 *
 * Mock mode (USE_MOCKS=true, default): fetchPageRatings returns realistic
 * varied mock Facebook ratings; postReply logs and simulates success. Swapping
 * to real means filling FACEBOOK_APP_* env vars — see MOCK-TO-REAL.md.
 *
 * Note: Facebook Page ratings/reviews use the `ratings` edge on the Page node.
 */

import type { BusinessCategory } from "@/lib/types";
import { generateMockReviews } from "@/lib/integrations/mock-data";

const USE_MOCKS = process.env.USE_MOCKS !== "false";

export interface FacebookRating {
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
 * Fetch ratings/reviews for a Facebook Page.
 * Real signature: (pageId, accessToken).
 */
export async function fetchPageRatings(
  pageId: string,
  accessToken: string,
  category: BusinessCategory = "other"
): Promise<FacebookRating[]> {
  if (USE_MOCKS || !accessToken) {
    await delay(150);
    const batch = generateMockReviews(randomBetween(1, 3), category, "facebook");
    return batch;
  }

  // ---- REAL implementation -------------------------------------------------
  // GET https://graph.facebook.com/v19.0/{pageId}/ratings?access_token=...
  const url = `https://graph.facebook.com/v19.0/${pageId}/ratings?access_token=${accessToken}&fields=open_graph_story,recommendation_type,review_text,created_time,reviewer`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`facebook fetchPageRatings failed: ${res.status}`);
  }
  const json = (await res.json()) as { data?: unknown[] };
  return (json.data ?? []).map((r) => mapFacebookRating(r as Record<string, unknown>));
}

/**
 * Post a reply/comment to a Facebook Page review (open_graph_story comment).
 */
export async function postReply(
  reviewId: string,
  replyText: string,
  accessToken: string
): Promise<PostReplyResult> {
  if (USE_MOCKS || !accessToken) {
    await delay(120);
    console.log(`[mock:facebook] postReply simulated for review ${reviewId}`);
    return { success: true, external_reply_id: `mock-fb-reply-${Date.now()}` };
  }

  // ---- REAL implementation -------------------------------------------------
  // POST https://graph.facebook.com/v19.0/{open_graph_story_id}/comments
  throw new Error(
    "facebook postReply real path requires page token + story id — see MOCK-TO-REAL.md"
  );
}

function mapFacebookRating(r: Record<string, unknown>): FacebookRating {
  const ogs = (r.open_graph_story ?? {}) as {
    id?: string;
    message?: string;
    rating?: number;
    start_time?: string;
  };
  const reviewer = (r.reviewer ?? {}) as { name?: string };
  return {
    external_review_id: String(ogs.id ?? r.id ?? ""),
    reviewer_name: String(reviewer.name ?? "Anonymous"),
    rating: Number(ogs.rating ?? (r.recommendation_type === "positive" ? 5 : 2)),
    review_text: String(ogs.message ?? r.review_text ?? ""),
    review_created_at: String(ogs.start_time ?? r.created_time ?? new Date().toISOString()),
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}