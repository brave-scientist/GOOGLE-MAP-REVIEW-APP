/**
 * lib/supabase/local-store.ts — file-backed JSON implementation of DataStore.
 *
 * Used automatically when Supabase credentials are absent (the default for the
 * mock-mode demo build). Lets the entire app run with zero real credentials.
 *
 * Persistence: a single JSON file at <repo>/local-store/db.json (gitignored).
 * Session: the demo user's id is held in a signed cookie set by lib/auth.ts;
 *          this store resolves "current user" from that id.
 *
 * PII note (Data-Handling-Policy.md 2.3): review_requests.customer_contact is
 * stored but never echoed into logs by this module.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { DataStore } from "@/lib/db";
import type {
  Business,
  Review,
  ReviewReply,
  ReviewRequest,
  ReviewRequestBatch,
  Subscription,
  User,
} from "@/lib/types";

interface LocalDB {
  currentUserId: string | null;
  users: User[];
  businesses: Business[];
  subscriptions: Subscription[];
  reviews: Review[];
  review_replies: ReviewReply[];
  review_requests: ReviewRequest[];
  review_request_batches: ReviewRequestBatch[];
}

const STORE_DIR = path.join(process.cwd(), "local-store");
const STORE_FILE = path.join(STORE_DIR, "db.json");

const EMPTY_DB: LocalDB = {
  currentUserId: null,
  users: [],
  businesses: [],
  subscriptions: [],
  reviews: [],
  review_replies: [],
  review_requests: [],
  review_request_batches: [],
};

async function read(): Promise<LocalDB> {
  try {
    const raw = await fs.readFile(STORE_FILE, "utf8");
    return { ...EMPTY_DB, ...(JSON.parse(raw) as Partial<LocalDB>) };
  } catch {
    return structuredClone(EMPTY_DB);
  }
}

async function write(db: LocalDB): Promise<void> {
  await fs.mkdir(STORE_DIR, { recursive: true });
  await fs.writeFile(STORE_FILE, JSON.stringify(db, null, 2), "utf8");
}

// Simple exclusive write lock to avoid races in the dev server.
let _writeChain: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = _writeChain.then(fn, fn);
  _writeChain = run.catch(() => {});
  return run;
}

function notNull<T>(v: T | undefined | null, msg: string): T {
  if (v === undefined || v === null) throw new Error(msg);
  return v;
}

export class LocalStore implements DataStore {
  // ---- users / session -----------------------------------------------------
  async getCurrentUser(): Promise<User | null> {
    const db = await read();
    if (!db.currentUserId) return null;
    return db.users.find((u) => u.id === db.currentUserId) ?? null;
  }

  async signIn(email: string): Promise<User> {
    return serialize(async () => {
      const db = await read();
      let user = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
      if (!user) {
        user = {
          id: randomUUID(),
          email,
          auth_provider: "email",
          created_at: new Date().toISOString(),
        };
        db.users.push(user);
      }
      db.currentUserId = user.id;
      await write(db);
      return user;
    });
  }

  async signOut(): Promise<void> {
    return serialize(async () => {
      const db = await read();
      db.currentUserId = null;
      await write(db);
    });
  }

  // ---- businesses ----------------------------------------------------------
  async getBusinessesForUser(userId: string): Promise<Business[]> {
    const db = await read();
    return db.businesses.filter((b) => b.owner_user_id === userId);
  }

  async listConnectedBusinesses(): Promise<Business[]> {
    const db = await read();
    return db.businesses.filter(
      (b) =>
        !!b.google_business_profile_account_id ||
        !!b.google_place_id ||
        !!b.facebook_page_id
    );
  }

  async getBusinessById(id: string): Promise<Business | null> {
    const db = await read();
    return db.businesses.find((b) => b.id === id) ?? null;
  }

  async createBusiness(input: {
    owner_user_id: string;
    name: string;
    category: Business["category"];
    timezone: string;
    brand_voice_notes?: string | null;
  }): Promise<Business> {
    return serialize(async () => {
      const db = await read();
      const business: Business = {
        id: randomUUID(),
        owner_user_id: input.owner_user_id,
        name: input.name,
        category: input.category,
        google_place_id: null,
        google_business_profile_account_id: null,
        facebook_page_id: null,
        google_oauth_token_encrypted: null,
        google_oauth_refresh_token_encrypted: null,
        facebook_oauth_token_encrypted: null,
        brand_voice_notes: input.brand_voice_notes ?? null,
        timezone: input.timezone,
        auto_post_positive_reviews: false,
        review_request_template:
          "Hi {customer_name}! Thanks for visiting {business_name}. We'd love your feedback — leave us a quick review here: {review_link}",
        notify_new_review_email: true,
        notify_new_review_sms: false,
        daily_digest: false,
        google_review_link: null,
        created_at: new Date().toISOString(),
      };
      db.businesses.push(business);
      await write(db);
      return business;
    });
  }

  async updateBusiness(id: string, patch: Partial<Business>): Promise<Business> {
    return serialize(async () => {
      const db = await read();
      const idx = db.businesses.findIndex((b) => b.id === id);
      const current = notNull(db.businesses[idx], `business ${id} not found`);
      const updated = { ...current, ...patch, id: current.id };
      db.businesses[idx] = updated;
      await write(db);
      return updated;
    });
  }

  // ---- subscriptions -------------------------------------------------------
  async getSubscription(businessId: string): Promise<Subscription | null> {
    const db = await read();
    return db.subscriptions.find((s) => s.business_id === businessId) ?? null;
  }

  async upsertSubscription(
    sub: Omit<Subscription, "id" | "created_at"> & { id?: string }
  ): Promise<Subscription> {
    return serialize(async () => {
      const db = await read();
      const existingIdx = db.subscriptions.findIndex(
        (s) => s.business_id === sub.business_id
      );
      if (existingIdx >= 0) {
        const current = notNull(
          db.subscriptions[existingIdx],
          `subscription for ${sub.business_id} not found`
        );
        const merged: Subscription = {
          ...current,
          ...sub,
          id: sub.id ?? current.id,
          created_at: current.created_at,
        };
        db.subscriptions[existingIdx] = merged;
        await write(db);
        return merged;
      }
      const created: Subscription = {
        id: randomUUID(),
        business_id: sub.business_id,
        stripe_customer_id: sub.stripe_customer_id ?? null,
        stripe_subscription_id: sub.stripe_subscription_id ?? null,
        plan: sub.plan,
        status: sub.status,
        current_period_end: sub.current_period_end ?? null,
        trial_ends_at: sub.trial_ends_at ?? null,
        created_at: new Date().toISOString(),
      };
      db.subscriptions.push(created);
      await write(db);
      return created;
    });
  }

  // ---- reviews -------------------------------------------------------------
  async listReviews(businessId: string): Promise<Review[]> {
    const db = await read();
    return db.reviews
      .filter((r) => r.business_id === businessId)
      .sort((a, b) => (a.fetched_at < b.fetched_at ? 1 : -1));
  }

  async upsertReview(
    review: Omit<Review, "id" | "fetched_at"> & { id?: string; fetched_at?: string }
  ): Promise<Review> {
    return serialize(async () => {
      const db = await read();
      const dedupeKey = `${review.business_id}|${review.source}|${review.external_review_id}`;
      const existing = db.reviews.find(
        (r) =>
          `${r.business_id}|${r.source}|${r.external_review_id}` === dedupeKey
      );
      if (existing) {
        // Deduplication: never create a duplicate row for the same platform review.
        return existing;
      }
      const created: Review = {
        id: review.id ?? randomUUID(),
        business_id: review.business_id,
        source: review.source,
        external_review_id: review.external_review_id,
        reviewer_name: review.reviewer_name,
        rating: review.rating,
        review_text: review.review_text,
        review_created_at: review.review_created_at ?? null,
        status: review.status ?? "new",
        fetched_at: review.fetched_at ?? new Date().toISOString(),
      };
      db.reviews.push(created);
      await write(db);
      return created;
    });
  }

  async updateReview(id: string, patch: Partial<Review>): Promise<Review> {
    return serialize(async () => {
      const db = await read();
      const idx = db.reviews.findIndex((r) => r.id === id);
      const current = notNull(db.reviews[idx], `review ${id} not found`);
      const updated = { ...current, ...patch, id: current.id };
      db.reviews[idx] = updated;
      await write(db);
      return updated;
    });
  }

  // ---- replies -------------------------------------------------------------
  async getReplyForReview(reviewId: string): Promise<ReviewReply | null> {
    const db = await read();
    return db.review_replies.find((r) => r.review_id === reviewId) ?? null;
  }

  async listRepliesForBusiness(businessId: string): Promise<ReviewReply[]> {
    const db = await read();
    const reviewIds = new Set(
      db.reviews.filter((r) => r.business_id === businessId).map((r) => r.id)
    );
    return db.review_replies.filter((r) => reviewIds.has(r.review_id));
  }

  async createReply(input: {
    review_id: string;
    draft_text: string | null;
  }): Promise<ReviewReply> {
    return serialize(async () => {
      const db = await read();
      const existing = db.review_replies.find((r) => r.review_id === input.review_id);
      if (existing) {
        existing.draft_text = input.draft_text;
        await write(db);
        return existing;
      }
      const reply: ReviewReply = {
        id: randomUUID(),
        review_id: input.review_id,
        draft_text: input.draft_text,
        final_text: null,
        posted_at: null,
        posted_by: null,
        status: "draft",
        error_message: null,
        created_at: new Date().toISOString(),
      };
      db.review_replies.push(reply);
      await write(db);
      return reply;
    });
  }

  async updateReply(id: string, patch: Partial<ReviewReply>): Promise<ReviewReply> {
    return serialize(async () => {
      const db = await read();
      const idx = db.review_replies.findIndex((r) => r.id === id);
      const current = notNull(db.review_replies[idx], `reply ${id} not found`);
      const updated = { ...current, ...patch, id: current.id };
      db.review_replies[idx] = updated;
      await write(db);
      return updated;
    });
  }

  // ---- review requests -----------------------------------------------------
  async listReviewRequests(businessId: string): Promise<ReviewRequest[]> {
    const db = await read();
    return db.review_requests
      .filter((r) => r.business_id === businessId)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }

  async createReviewRequest(
    input: Omit<ReviewRequest, "id" | "created_at" | "status" | "click_token"> & {
      status?: ReviewRequest["status"];
      click_token?: string | null;
    }
  ): Promise<ReviewRequest> {
    return serialize(async () => {
      const db = await read();
      const req: ReviewRequest = {
        id: randomUUID(),
        business_id: input.business_id,
        customer_name: input.customer_name,
        customer_contact: input.customer_contact,
        channel: input.channel,
        message_text: input.message_text ?? null,
        sent_at: input.sent_at ?? null,
        status: input.status ?? "queued",
        source: input.source,
        entry_method: input.entry_method,
        click_token: input.click_token ?? randomUUID(),
        created_at: new Date().toISOString(),
      };
      db.review_requests.push(req);
      await write(db);
      return req;
    });
  }

  async updateReviewRequest(
    id: string,
    patch: Partial<ReviewRequest>
  ): Promise<ReviewRequest> {
    return serialize(async () => {
      const db = await read();
      const idx = db.review_requests.findIndex((r) => r.id === id);
      const current = notNull(db.review_requests[idx], `request ${id} not found`);
      const updated = { ...current, ...patch, id: current.id };
      db.review_requests[idx] = updated;
      await write(db);
      return updated;
    });
  }

  // ---- batches -------------------------------------------------------------
  async createBatch(input: {
    business_id: string;
    total_contacts: number;
  }): Promise<ReviewRequestBatch> {
    return serialize(async () => {
      const db = await read();
      const batch: ReviewRequestBatch = {
        id: randomUUID(),
        business_id: input.business_id,
        uploaded_at: new Date().toISOString(),
        total_contacts: input.total_contacts,
        sent_count: 0,
        failed_count: 0,
      };
      db.review_request_batches.push(batch);
      await write(db);
      return batch;
    });
  }

  async updateBatch(
    id: string,
    patch: Partial<ReviewRequestBatch>
  ): Promise<ReviewRequestBatch> {
    return serialize(async () => {
      const db = await read();
      const idx = db.review_request_batches.findIndex((b) => b.id === id);
      const current = notNull(db.review_request_batches[idx], `batch ${id} not found`);
      const updated = { ...current, ...patch, id: current.id };
      db.review_request_batches[idx] = updated;
      await write(db);
      return updated;
    });
  }

  // ---- maintenance ---------------------------------------------------------
  async countRequestsThisMonth(businessId: string): Promise<number> {
    const db = await read();
    const now = new Date();
    return db.review_requests.filter((r) => {
      if (r.business_id !== businessId) return false;
      const created = new Date(r.created_at);
      return (
        created.getFullYear() === now.getFullYear() &&
        created.getMonth() === now.getMonth()
      );
    }).length;
  }
}