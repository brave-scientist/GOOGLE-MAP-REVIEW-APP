/**
 * scripts/seed.ts — seed the local file-backed store with realistic demo data.
 *
 * Per kickoff §2.3: 2-3 mock businesses across categories, 15-20 reviews each
 * spanning the full 1-5 star range and both Google + Facebook as source, and a
 * handful of mock review_requests in various statuses (sent, clicked, failed).
 *
 * Run with: pnpm seed   (or: pnpm tsx scripts/seed.ts)
 * Idempotent-ish: clears and rewrites the local store file on each run so the
 * demo always starts from a known state.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { generateMockReviews } from "@/lib/integrations/mock-data";
import type {
  Business,
  BusinessCategory,
  Review,
  ReviewRequest,
  ReviewRequestBatch,
  Subscription,
  User,
  Organization,
} from "@/lib/types";

const STORE_DIR = path.join(process.cwd(), "local-store");
const STORE_FILE = path.join(STORE_DIR, "db.json");

interface LocalDB {
  currentUserId: string | null;
  users: User[];
  organizations: Organization[];
  businesses: Business[];
  subscriptions: Subscription[];
  reviews: Review[];
  review_replies: import("@/lib/types").ReviewReply[];
  review_requests: ReviewRequest[];
  review_request_batches: ReviewRequestBatch[];
}

async function main() {
  const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
  const hoursAgo = (n: number) => new Date(Date.now() - n * 3600000).toISOString();

  // ---- Demo user -----------------------------------------------------------
  const owner: User = {
    id: "demo-owner-0001",
    email: "owner@reviewreply.demo",
    auth_provider: "email",
    role: "org_admin",
    created_at: daysAgo(10),
  };

  const mockOrg: Organization = {
    id: "org-demo-0001",
    name: "Copper & Smiles Group",
    owner_user_id: "demo-owner-0001",
    created_at: daysAgo(10),
  };

  // ---- Businesses (3, different categories) --------------------------------
  const makeBusiness = (
    id: string,
    name: string,
    category: BusinessCategory,
    brandVoice: string,
    opts: Partial<Business> = {}
  ): Business => ({
    id,
    owner_user_id: owner.id,
    organization_id: mockOrg.id,
    name,
    category,
    google_place_id: `mock-place-${id}`,
    google_business_profile_account_id: `mock-gbp-acct-${id}`,
    facebook_page_id: `mock-fb-page-${id}`,
    google_oauth_token_encrypted: null,
    google_oauth_refresh_token_encrypted: null,
    facebook_oauth_token_encrypted: null,
    brand_voice_notes: brandVoice,
    timezone: "America/New_York",
    auto_post_positive_reviews: id === "biz-salon-001", // salon demo has auto-post on
    review_request_template:
      "Hi {customer_name}! Thanks for visiting {business_name}. We'd love your feedback — leave us a quick review here: {review_link}",
    notify_new_review_email: true,
    notify_new_review_sms: false,
    daily_digest: false,
    google_review_link: `https://g.page/r/mock-${id}/review`,
    created_at: daysAgo(10),
    ...opts,
  });

  const businesses: Business[] = [
    makeBusiness(
      "biz-restaurant-001",
      "The Copper Spoon",
      "restaurant",
      "Casual, warm, uses first names. We're a family-run bistro — always mention our dog Biscuit if it fits naturally. Sign off: '— The Copper Spoon crew'"
    ),
    makeBusiness(
      "biz-dental-001",
      "Bright Smile Dental",
      "dental",
      "Professional but calming. Reassuring, not clinical. We always offer to help with any concerns. Sign off: '— The Bright Smile team'"
    ),
    makeBusiness(
      "biz-salon-001",
      "Northside Salon",
      "salon",
      "Friendly, upbeat, first names. We love chatting about hair. Sign off: '— see you at your next appointment!'"
    ),
  ];

  // ---- Subscriptions -------------------------------------------------------
  const subscriptions: Subscription[] = [
    {
      id: randomUUID(),
      business_id: "biz-restaurant-001",
      stripe_customer_id: "mock-cus-biz-restaurant-001",
      stripe_subscription_id: "mock-sub-biz-restaurant-001",
      plan: "starter",
      status: "active",
      current_period_end: daysAgo(-20),
      trial_ends_at: daysAgo(-4),
      created_at: daysAgo(10),
    },
    {
      id: randomUUID(),
      business_id: "biz-dental-001",
      stripe_customer_id: "mock-cus-biz-dental-001",
      stripe_subscription_id: "mock-sub-biz-dental-001",
      plan: "pro",
      status: "active",
      current_period_end: daysAgo(-20),
      trial_ends_at: daysAgo(-4),
      created_at: daysAgo(10),
    },
    {
      id: randomUUID(),
      business_id: "biz-salon-001",
      stripe_customer_id: "mock-cus-biz-salon-001",
      stripe_subscription_id: "mock-sub-biz-salon-001",
      plan: "pro",
      status: "trialing",
      current_period_end: daysAgo(-16),
      trial_ends_at: daysAgo(-4),
      created_at: daysAgo(10),
    },
  ];

  // ---- Reviews: 16 per business, mixed ratings, both sources ---------------
  const reviews: Review[] = [];
  for (const biz of businesses) {
    // Force a spread of ratings rather than pure randomness so every business
    // shows the full 1-5 range in the demo.
    const googleCount = 9;
    const fbCount = 7;
    const googleReviews = generateMockReviews(googleCount, biz.category, "google");
    const fbReviews = generateMockReviews(fbCount, biz.category, "facebook");
    // Override ratings to guarantee coverage across 1-5.
    const desired = [5, 5, 4, 4, 3, 3, 2, 1, 1];
    googleReviews.forEach((r, i) => {
      r.rating = desired[i % desired.length]!;
      reviews.push({
        id: randomUUID(),
        business_id: biz.id,
        source: "google",
        external_review_id: r.external_review_id,
        reviewer_name: r.reviewer_name,
        rating: r.rating,
        review_text: r.review_text,
        review_created_at: hoursAgo(i * 7 + 1),
        status: "new",
        fetched_at: hoursAgo(i * 2),
      });
    });
    const desiredFb = [5, 4, 3, 2, 2, 1, 5];
    fbReviews.forEach((r, i) => {
      r.rating = desiredFb[i % desiredFb.length]!;
      reviews.push({
        id: randomUUID(),
        business_id: biz.id,
        source: "facebook",
        external_review_id: r.external_review_id,
        reviewer_name: r.reviewer_name,
        rating: r.rating,
        review_text: r.review_text,
        review_created_at: hoursAgo(i * 11 + 2),
        status: "new",
        fetched_at: hoursAgo(i * 3 + 1),
      });
    });
  }

  // ---- Review requests in mixed statuses -----------------------------------
  const review_requests: ReviewRequest[] = [
    {
      id: randomUUID(),
      business_id: "biz-restaurant-001",
      customer_name: "Olivia Park",
      customer_contact: "5551234567",
      channel: "sms",
      message_text: null,
      sent_at: hoursAgo(20),
      status: "sent",
      source: "manual_upload",
      entry_method: "quick_add",
      click_token: randomUUID(),
      created_at: hoursAgo(20),
    },
    {
      id: randomUUID(),
      business_id: "biz-restaurant-001",
      customer_name: "Devon Cruz",
      customer_contact: "5559876543",
      channel: "sms",
      message_text: null,
      sent_at: hoursAgo(30),
      status: "clicked",
      source: "manual_upload",
      entry_method: "paste_list",
      click_token: randomUUID(),
      created_at: hoursAgo(30),
    },
    {
      id: randomUUID(),
      business_id: "biz-dental-001",
      customer_name: "Maya Singh",
      customer_contact: "maya.singh@example.com",
      channel: "email",
      message_text: null,
      sent_at: null,
      status: "failed",
      source: "manual_upload",
      entry_method: "csv_import",
      click_token: randomUUID(),
      created_at: hoursAgo(5),
    },
    {
      id: randomUUID(),
      business_id: "biz-salon-001",
      customer_name: "Jordan Lee",
      customer_contact: "5554443333",
      channel: "sms",
      message_text: null,
      sent_at: hoursAgo(2),
      status: "sent",
      source: "manual_upload",
      entry_method: "quick_add",
      click_token: randomUUID(),
      created_at: hoursAgo(2),
    },
    {
      id: randomUUID(),
      business_id: "biz-salon-001",
      customer_name: "Riley Chen",
      customer_contact: "5552221111",
      channel: "sms",
      message_text: null,
      sent_at: null,
      status: "queued",
      source: "manual_upload",
      entry_method: "paste_list",
      click_token: randomUUID(),
      created_at: hoursAgo(1),
    },
  ];

  const batches: ReviewRequestBatch[] = [
    {
      id: randomUUID(),
      business_id: "biz-restaurant-001",
      uploaded_at: hoursAgo(30),
      total_contacts: 3,
      sent_count: 2,
      failed_count: 0,
    },
    {
      id: randomUUID(),
      business_id: "biz-dental-001",
      uploaded_at: hoursAgo(5),
      total_contacts: 1,
      sent_count: 0,
      failed_count: 1,
    },
  ];

  const db: LocalDB = {
    currentUserId: owner.id, // auto-log-in the demo owner
    users: [owner],
    organizations: [mockOrg],
    businesses,
    subscriptions,
    reviews,
    review_replies: [], // drafts are generated on demand / by jobs
    review_requests,
    review_request_batches: batches,
  };

  await fs.mkdir(STORE_DIR, { recursive: true });
  await fs.writeFile(STORE_FILE, JSON.stringify(db, null, 2), "utf8");

  console.log("✓ Seeded local-store/db.json");
  console.log(`  - 1 demo user (${owner.email})`);
  console.log(`  - ${businesses.length} businesses (${businesses.map((b) => b.category).join(", ")})`);
  console.log(`  - ${reviews.length} reviews (1-5★, Google + Facebook)`);
  console.log(`  - ${review_requests.length} review requests (mixed statuses)`);
  console.log(`  - ${subscriptions.length} subscriptions`);
console.log("  Run `pnpm dev` and visit http://localhost:3001");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});