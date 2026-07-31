# Data-Handling & Security Policy — ReviewReply-Lite

Purpose: this product touches real customer PII (business owners' customer names, phone numbers, emails) and OAuth access tokens for connected Google and Facebook business accounts. This document states the non-negotiable handling rules for that data. It is not a compliance framework — it is the minimum a product like this owes the people whose data passes through it.

---

## 1. What Data We Hold, and Why

| Data | Source | Why we need it |
|---|---|---|
| Business owner's email, name | Signup | Account identity, billing, notifications |
| Google/Facebook OAuth access + refresh tokens | OAuth connect flow | Required to pull reviews and post replies on the owner's behalf |
| End-customer name, phone, email | Quick-add / paste-list / CSV upload | Required to send review-request SMS/email |
| Review text, ratings, reviewer names | Google/Facebook APIs | Core product function (display + AI drafting) |
| AI-drafted and posted reply text | Generated internally | Displayed to owner, posted publicly on their behalf |

We do not collect anything beyond this list without a documented reason added to this file.

## 2. Storage Rules

1. **OAuth tokens are encrypted at rest.** Use Supabase's column-level encryption (or application-level encryption before insert if column-level isn't sufficient) for `google_business_profile_account_id`-adjacent access/refresh tokens. Never store a raw, unencrypted OAuth token in a plaintext column.
2. **End-customer contact data (`review_requests.customer_contact`) is treated as PII, full stop.** It is stored only as long as needed to send the request and support the click-tracking/status feature — it is not exported to analytics tools, not logged in plaintext anywhere, and not used for any purpose beyond the review-request send it was collected for.
3. **No PII in logs.** Sentry, PostHog, and any application logs must never contain raw customer names, phone numbers, or email addresses in error messages or event payloads. Use internal IDs (`review_request_id`, `business_id`) in logs, not the underlying contact info. This must be verified explicitly during Week 5 (review-request build) and Week 6 (billing) — it's easy to accidentally log a full request object that includes PII, and that's exactly the failure mode to check for.
4. **Database backups follow the same encryption standard as live data** — Supabase's default backup encryption is acceptable; no separate unencrypted export process should exist.

## 3. Access Rules

1. Only the founder (and, if applicable, a support person handling the shared inbox) has access to the Supabase dashboard and production environment variables. The executing agent should not need standing production database credentials once the app has its own service-role key wired through environment variables — avoid a human needing to hand-query the production DB as a routine practice.
2. API keys and secrets live only in Vercel environment variables and `.env.local` (gitignored) — never in code, never in Slack/email, never in this repo's committed files.
3. Stripe, Twilio, and Resend dashboards should have two-factor authentication enabled on the founder's account before go-live (Week 11).

## 4. Deletion & Retention Rules

1. **When a business cancels their subscription:** their `review_requests` end-customer contact data (names, phones, emails collected from their customers) is deleted within 30 days of cancellation, not retained indefinitely "in case they come back." Review data pulled from Google/Facebook may be retained longer since it's public data already visible on those platforms, but the business's OAuth tokens are revoked and deleted immediately on cancellation, not left dormant.
2. **When an end-customer's data was collected in error** (wrong number, business owner requests removal), there must be a way for the business owner to delete an individual `review_requests` row from the UI — this is not optional; people will ask for this.
3. **A data-deletion request from the founder's own customer** ("delete my whole account") should result in the full removal of that business's rows across every table (`businesses`, `reviews`, `review_replies`, `review_requests`, `subscriptions` — after final billing reconciliation) within 30 days, not just a soft "deactivated" flag that keeps everything in the database indefinitely.

## 5. Third-Party API Compliance Notes

1. **Google Business Profile API and Facebook Graph API both have their own data-use policies** (e.g., restrictions on how review data can be used or displayed outside the product). Do not repurpose pulled review data for any secondary use (e.g., a public "best reviews" marketing feature scraping customer review text) without re-checking each platform's current API terms first — this is a "check before you build," not a "we'll deal with it later" item.
2. **Twilio 10DLC registration** requires accurate business information and an accurate description of message use-case (review requests) — do not use the registered SMS number/campaign for any other message type (e.g., marketing blasts) without updating the registration, since mismatched use-case is a common cause of carrier filtering/blocking.

## 6. What This Policy Is Not

This is not a GDPR/CCPA compliance program, a SOC 2 framework, or legal advice. If the product later takes on customers in jurisdictions with specific data-protection law requirements (EU businesses, California businesses processing consumer data at scale, etc.), or reaches a size where formal compliance certification becomes commercially necessary, that requires a real legal/compliance review at that time — this document is the sensible baseline for a pre-launch, single-founder product, not a substitute for that future work.

---

*Any question not answered by this document that comes up during the build (e.g. "should we log this field?") is an escalation trigger per `AGENTS.md` Section 3 — log the question and resolution in `Decision-Log.md` rather than deciding silently.*
