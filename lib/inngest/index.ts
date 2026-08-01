/**
 * lib/inngest/index.ts — central registry of all Inngest functions.
 *
 * The /api/inngest route imports `functions` from here and passes them to
 * serve(). Keeping a single registry means a job is registered the moment its
 * file is created and imported here.
 */

import { inngest } from "@/lib/inngest/client";
import { pollReviewsJob } from "@/lib/inngest/poll-reviews";
import { generateReplyDraftJob } from "@/lib/inngest/generate-reply-draft";
import { sendReviewRequestJob } from "@/lib/inngest/send-review-request";

export { inngest };

export const functions = [
  pollReviewsJob,
  generateReplyDraftJob,
  sendReviewRequestJob,
];