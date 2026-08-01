/**
 * lib/db.ts — unified data-access layer.
 *
 * The app never talks to Supabase directly from route handlers or components.
 * It imports from this module, which exposes a stable DataStore interface. The
 * concrete implementation is chosen once at process start:
 *   - If NEXT_PUBLIC_SUPABASE_URL + service role key are present AND USE_MOCKS
 *     is false -> SupabaseStore (real Postgres + RLS).
 *   - Otherwise -> LocalStore (file-backed JSON), so the app runs with zero
 *     real credentials. This is the default for the mock-mode demo build.
 *
 * All writes/reads are typed against lib/types.ts. PII is never logged: error
 * paths use row ids only (Data-Handling-Policy.md Section 2.3).
 */

import type {
  Business,
  Review,
  ReviewReply,
  ReviewRequest,
  ReviewRequestBatch,
  Subscription,
  User,
} from "@/lib/types";

export interface DataStore {
  // ---- users / session -----------------------------------------------------
  getCurrentUser(): Promise<User | null>;
  /** Mock-mode only: sign up / log in a local demo user by email. */
  signIn(email: string): Promise<User>;
  signOut(): Promise<void>;

  // ---- businesses ----------------------------------------------------------
  getBusinessesForUser(userId: string): Promise<Business[]>;
  /** All businesses with a connected platform (used by the scheduled poll job). */
  listConnectedBusinesses(): Promise<Business[]>;
  getBusinessById(id: string): Promise<Business | null>;
  createBusiness(input: {
    owner_user_id: string;
    name: string;
    category: Business["category"];
    timezone: string;
    brand_voice_notes?: string | null;
  }): Promise<Business>;
  updateBusiness(id: string, patch: Partial<Business>): Promise<Business>;

  // ---- subscriptions -------------------------------------------------------
  getSubscription(businessId: string): Promise<Subscription | null>;
  upsertSubscription(
    sub: Omit<Subscription, "id" | "created_at"> & { id?: string }
  ): Promise<Subscription>;

  // ---- reviews -------------------------------------------------------------
  listReviews(businessId: string): Promise<Review[]>;
  upsertReview(
    review: Omit<Review, "id" | "fetched_at"> & { id?: string; fetched_at?: string }
  ): Promise<Review>;
  updateReview(id: string, patch: Partial<Review>): Promise<Review>;

  // ---- replies -------------------------------------------------------------
  getReplyForReview(reviewId: string): Promise<ReviewReply | null>;
  listRepliesForBusiness(businessId: string): Promise<ReviewReply[]>;
  createReply(input: { review_id: string; draft_text: string | null }): Promise<ReviewReply>;
  updateReply(id: string, patch: Partial<ReviewReply>): Promise<ReviewReply>;

  // ---- review requests -----------------------------------------------------
  listReviewRequests(businessId: string): Promise<ReviewRequest[]>;
  createReviewRequest(
    input: Omit<ReviewRequest, "id" | "created_at" | "status" | "click_token"> & {
      status?: ReviewRequest["status"];
      click_token?: string | null;
    }
  ): Promise<ReviewRequest>;
  updateReviewRequest(id: string, patch: Partial<ReviewRequest>): Promise<ReviewRequest>;

  // ---- batches -------------------------------------------------------------
  createBatch(input: {
    business_id: string;
    total_contacts: number;
  }): Promise<ReviewRequestBatch>;
  updateBatch(id: string, patch: Partial<ReviewRequestBatch>): Promise<ReviewRequestBatch>;

  // ---- maintenance ---------------------------------------------------------
  /** Count review requests sent this calendar month (for plan-limit gating). */
  countRequestsThisMonth(businessId: string): Promise<number>;
}

// ---------------------------------------------------------------------------
// Implementation selection
// ---------------------------------------------------------------------------

let _store: DataStore | null = null;

export async function getStore(): Promise<DataStore> {
  if (_store) return _store;
  const useMocks = process.env.USE_MOCKS !== "false";
  const hasSupabase =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!useMocks && hasSupabase) {
    const { SupabaseStore } = await import("@/lib/supabase/supabase-store");
    _store = new SupabaseStore();
  } else {
    const { LocalStore } = await import("@/lib/supabase/local-store");
    _store = new LocalStore();
  }
  return _store;
}

/** Test-only: reset the cached store (used by vitest to isolate cases). */
export function _resetStoreForTest(): void {
  _store = null;
}