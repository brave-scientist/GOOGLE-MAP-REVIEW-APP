/**
 * app/(app)/reviews/page.tsx — list of all reviews for the business.
 *
 * Phase 1 / Day 14: list view, newest first, showing source icon (Google/
 * Facebook), rating, reviewer name, review text, and status badge. The reply
 * UI (editable draft, Regenerate, Post Reply) is added in Week 4.
 */

import { getCurrentUser, getActiveBusiness } from "@/lib/auth";
import { getStore } from "@/lib/db";
import ReviewCard from "@/components/ReviewCard";
import { redirect } from "next/navigation";

export default async function ReviewsPage() {
  const user = await getCurrentUser();
  const store = await getStore();
  const business = await getActiveBusiness();

  if (!business) {
    redirect("/onboarding");
  }

  const reviews = await store.listReviews(business.id);
  const replies = await store.listRepliesForBusiness(business.id);
  const replyByReviewId = new Map(replies.map((r) => [r.review_id, r]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-cream">Reviews</h1>
        <p className="mt-1 text-sm text-cream-dim">
          {reviews.length} review{reviews.length === 1 ? "" : "s"} from Google + Facebook.
        </p>
      </div>

      {reviews.length === 0 ? (
        <div className="rounded-xl border border-cream/10 bg-ink-2 p-8 text-center">
          <p className="text-cream-dim">No reviews yet.</p>
          <p className="mt-1 text-sm text-cream-dim">
            Reviews will appear here automatically once the poll job runs (every 20 minutes).
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              reply={replyByReviewId.get(review.id) ?? null}
              business={business}
            />
          ))}
        </div>
      )}
    </div>
  );
}