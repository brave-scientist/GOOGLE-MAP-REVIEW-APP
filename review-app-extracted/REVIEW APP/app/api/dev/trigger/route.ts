/**
 * app/api/dev/trigger/route.ts — manual job trigger for testing.
 *
 * Per Implementation-Plan §4: every Inngest function must be manually
 * triggerable without waiting for its real schedule. This endpoint invokes the
 * job's core logic directly (works even with no Inngest DevServer running, i.e.
 * pure local mock mode).
 *
 * Examples:
 *   POST /api/dev/trigger?job=poll-reviews
 *   POST /api/dev/trigger?job=poll-reviews&business_id=biz-restaurant-001
 *   POST /api/dev/trigger?job=generate-reply-draft&review_id=<uuid>
 *   POST /api/dev/trigger?job=send-review-request&request_id=<uuid>
 *
 * Dev-only convenience — not part of the product surface.
 */

import { NextRequest, NextResponse } from "next/server";
import { runPollReviews } from "@/lib/inngest/poll-reviews";
import { runGenerateReplyDraft } from "@/lib/inngest/generate-reply-draft";
import { runSendReviewRequest } from "@/lib/inngest/send-review-request";

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const job = url.searchParams.get("job");
  const businessId = url.searchParams.get("business_id") ?? undefined;
  const reviewId = url.searchParams.get("review_id");
  const requestId = url.searchParams.get("request_id");

  try {
    switch (job) {
      case "poll-reviews":
        await runPollReviews(businessId);
        return NextResponse.json({ ok: true, job, business_id: businessId ?? "all" });
      case "generate-reply-draft":
        if (!reviewId) {
          return NextResponse.json(
            { ok: false, error: "review_id required" },
            { status: 400 }
          );
        }
        await runGenerateReplyDraft(reviewId);
        return NextResponse.json({ ok: true, job, review_id: reviewId });
      case "send-review-request":
        if (!requestId) {
          return NextResponse.json(
            { ok: false, error: "request_id required" },
            { status: 400 }
          );
        }
        await runSendReviewRequest(requestId);
        return NextResponse.json({ ok: true, job, request_id: requestId });
      default:
        return NextResponse.json(
          { ok: false, error: `unknown job: ${job}` },
          { status: 400 }
        );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}