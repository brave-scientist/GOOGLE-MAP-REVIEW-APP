/**
 * lib/inngest/send-review-request.ts
 *
 * Consumes queued review_requests rows, renders the business's message template
 * with merge fields ({customer_name}, {business_name}, {review_link}), sends
 * via Twilio (SMS) or Resend (email) based on channel, applies pacing (stagger
 * sends within a batch by a few seconds each — not needed for single
 * quick-adds), and updates status.
 *
 * Manual-triggerable (Implementation-Plan §4):
 *   POST /api/dev/trigger?job=send-review-request&request_id=...
 */

import { inngest, EVENTS } from "@/lib/inngest/client";
import { getStore } from "@/lib/db";
import { sendSms } from "@/lib/integrations/twilio";
import { sendEmail } from "@/lib/integrations/resend";
import type { ReviewRequest } from "@/lib/types";

/** Pacing delay between sends within a batch (looks natural, avoids spam flags). */
const BATCH_PACING_MS = 2000;

/** Render the business template with merge fields. */
function renderTemplate(
  template: string,
  fields: { customer_name: string; business_name: string; review_link: string }
): string {
  return template
    .replaceAll("{customer_name}", fields.customer_name)
    .replaceAll("{business_name}", fields.business_name)
    .replaceAll("{review_link}", fields.review_link);
}

/** Core logic for a single request, callable directly. */
export async function runSendReviewRequest(requestId: string): Promise<void> {
  const store = await getStore();

  // Locate the request by scanning its business's requests.
  const businesses = await store.listConnectedBusinesses();
  let request: ReviewRequest | null = null;
  for (const b of businesses) {
    const found = (await store.listReviewRequests(b.id)).find((r) => r.id === requestId);
    if (found) {
      request = found;
      break;
    }
  }
  if (!request) {
    console.log(`[send-review-request] request ${requestId} not found`);
    return;
  }

  // Resolve the business for the template + review link.
  const business = await store.getBusinessById(request.business_id);
  if (!business) {
    await store.updateReviewRequest(requestId, {
      status: "failed",
    });
    return;
  }

const reviewLink = business.google_review_link ?? `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001"}/r/${request.click_token}`;
  const messageText = renderTemplate(business.review_request_template, {
    customer_name: request.customer_name,
    business_name: business.name,
    review_link: reviewLink,
  });

  // Send via the configured channel.
  let ok = false;
  if (request.channel === "sms") {
    const result = await sendSms(request.customer_contact, messageText);
    ok = result.success;
  } else {
    const result = await sendEmail({
      to: request.customer_contact,
      subject: `How was your visit to ${business.name}?`,
      body: messageText,
    });
    ok = result.success;
  }

  await store.updateReviewRequest(requestId, {
    status: ok ? "sent" : "failed",
    sent_at: ok ? new Date().toISOString() : null,
    message_text: messageText,
  });
}

/** Inngest function registration — triggered per-queued-request or manually. */
export const sendReviewRequestJob = inngest.createFunction(
  { id: "send-review-request", name: "Send review request" },
  [{ event: EVENTS.reviewRequestQueued }, { event: EVENTS.manualSendRequest }],
  async ({ event }) => {
    const data = event?.data as { request_id?: string } | undefined;
    const requestId = data?.request_id;
    if (!requestId) return { ok: false, reason: "missing request_id" };
    await runSendReviewRequest(requestId);
    return { ok: true };
  }
);

/** Convenience: send a batch of queued requests with pacing. */
export async function runSendBatch(
  businessId: string,
  requestIds: string[]
): Promise<void> {
  for (let i = 0; i < requestIds.length; i++) {
    await runSendReviewRequest(requestIds[i]!);
    // Pacing between sends within a batch (skip after the last one).
    if (i < requestIds.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_PACING_MS));
    }
  }
}