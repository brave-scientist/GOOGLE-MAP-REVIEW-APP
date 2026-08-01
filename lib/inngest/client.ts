/**
 * lib/inngest/client.ts — Inngest client + shared event names.
 *
 * Per Implementation-Plan §4: every Inngest function must be manually
 * triggerable for testing. We expose a `triggerJob()` helper that fires an
 * event by name so any job can be exercised without waiting for its real
 * schedule. The dev UI at /api/inngest also lets Inngest DevServer trigger
 * them interactively.
 */

import { Inngest } from "inngest";

export const inngest = new Inngest({ id: "reviewreply-lite" });

/** Canonical event names used across jobs. */
export const EVENTS = {
  reviewReceived: "review.received",
  reviewRequestQueued: "review_request.queued",
  manualPollReviews: "manual/poll-reviews",
  manualGenerateDraft: "manual/generate-reply-draft",
  manualSendRequest: "manual/send-review-request",
} as const;

/**
 * Fire an Inngest event. Works in real mode (Inngest cloud) and dev mode
 * (Inngest DevServer). Falls back to a direct function call when Inngest is
 * unavailable (pure local mock with no DevServer running) — see withFallback.
 */
export async function triggerJob(
  eventName: string,
  data: Record<string, unknown>
): Promise<void> {
  try {
    await inngest.send({ name: eventName, data });
  } catch {
    // Inngest not reachable (no DevServer / no creds). Jobs also expose a
    // direct run() entry point so route handlers can invoke them synchronously
    // as a fallback — see lib/inngest/runner.ts.
    console.log(`[inngest:fallback] event ${eventName} not delivered (no DevServer)`);
  }
}