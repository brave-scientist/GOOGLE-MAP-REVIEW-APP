/**
 * lib/supabase/supabase-store.ts — real Supabase-backed DataStore.
 *
 * Active ONLY when USE_MOCKS=false AND Supabase credentials are present.
 * In the default mock-mode build this module is never imported at runtime, but
 * it is written in full so that flipping the env switch is a config-only change
 * (see MOCK-TO-REAL.md).
 *
 * Conforms to the DataStore interface from lib/db.ts. Uses the service-role
 * client for writes that background jobs perform; uses the per-request server
 * client for reads so RLS scopes data to the logged-in owner
 * (Data-Handling-Policy.md Section 3).
 */

import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { DataStore } from "@/lib/db";
import type {
  Business,
  Review,
  ReviewReply,
  ReviewRequest,
  ReviewRequestBatch,
  Subscription,
  User,
  Organization,
} from "@/lib/types";

function assertRow<T>(data: T | null, msg: string): T {
  if (data === null) throw new Error(msg);
  return data;
}

export class SupabaseStore implements DataStore {
  // ---- users / session -----------------------------------------------------
  async getCurrentUser(): Promise<User | null> {
    const sb = createServerSupabaseClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return null;
    const { data } = await sb.from("users").select("*").eq("id", user.id).single();
    return (data as User | null) ?? null;
  }

  async signIn(email: string): Promise<User> {
    // Real mode uses Supabase Auth (lib/auth.ts), not this method. Provided to
    // satisfy the interface; it kicks off a magic-link sign-in.
    const sb = createServerSupabaseClient();
    const { error } = await sb.auth.signInWithOtp({ email });
    if (error) throw error;
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) throw new Error("sign-in pending — check email for OTP link");
    return assertRow<User>(null, "not implemented in real mode");
  }

  async signOut(): Promise<void> {
    const sb = createServerSupabaseClient();
    await sb.auth.signOut();
  }

  // ---- organizations --------------------------------------------------------
  async getOrganizationById(id: string): Promise<Organization | null> {
    const sb = createServerSupabaseClient();
    const { data, error } = await sb
      .from("organizations")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return (data as Organization | null) ?? null;
  }

  async getOrganizationsForUser(userId: string): Promise<Organization[]> {
    const sb = createServerSupabaseClient();
    const { data, error } = await sb
      .from("organizations")
      .select("*")
      .eq("owner_user_id", userId);
    if (error) throw error;
    return (data ?? []) as Organization[];
  }

  async createOrganization(input: { name: string; owner_user_id: string }): Promise<Organization> {
    const sb = createServerSupabaseClient();
    const { data, error } = await sb
      .from("organizations")
      .insert({
        name: input.name,
        owner_user_id: input.owner_user_id,
      })
      .select()
      .single();
    if (error) throw error;
    return assertRow<Organization>(data as Organization, "organization insert failed");
  }

  async updateOrganization(id: string, patch: Partial<Organization>): Promise<Organization> {
    const sb = createServerSupabaseClient();
    const { data, error } = await sb
      .from("organizations")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return assertRow<Organization>(data as Organization, `organization ${id} update failed`);
  }

  // ---- businesses ----------------------------------------------------------
  async getBusinessesForUser(userId: string): Promise<Business[]> {
    const sb = createServerSupabaseClient();
    const { data, error } = await sb
      .from("businesses")
      .select("*")
      .eq("owner_user_id", userId);
    if (error) throw error;
    return (data ?? []) as Business[];
  }

  async getBusinessesForOrganization(organizationId: string): Promise<Business[]> {
    const sb = createServerSupabaseClient();
    const { data, error } = await sb
      .from("businesses")
      .select("*")
      .eq("organization_id", organizationId);
    if (error) throw error;
    return (data ?? []) as Business[];
  }

  async listConnectedBusinesses(): Promise<Business[]> {
    // Runs in the background worker with the service-role client so it bypasses
    // RLS to enumerate every connected business for the scheduled poll job.
    const sb = createServiceRoleClient();
    const { data, error } = await sb
      .from("businesses")
      .select("*")
      .or("google_business_profile_account_id.neq.,google_place_id.neq.,facebook_page_id.neq.");
    if (error) throw error;
    return (data ?? []) as Business[];
  }

  async getBusinessById(id: string): Promise<Business | null> {
    const sb = createServerSupabaseClient();
    const { data, error } = await sb
      .from("businesses")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return (data as Business | null) ?? null;
  }

  async createBusiness(input: {
    owner_user_id: string;
    organization_id?: string | null;
    name: string;
    category: Business["category"];
    timezone: string;
    brand_voice_notes?: string | null;
  }): Promise<Business> {
    const sb = createServerSupabaseClient();
    const { data, error } = await sb
      .from("businesses")
      .insert({
        owner_user_id: input.owner_user_id,
        organization_id: input.organization_id ?? null,
        name: input.name,
        category: input.category,
        timezone: input.timezone,
        brand_voice_notes: input.brand_voice_notes ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return assertRow<Business>(data as Business, "business insert failed");
  }

  async updateBusiness(id: string, patch: Partial<Business>): Promise<Business> {
    const sb = createServerSupabaseClient();
    const { data, error } = await sb
      .from("businesses")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return assertRow<Business>(data as Business, `business ${id} update failed`);
  }

  // ---- subscriptions -------------------------------------------------------
  async getSubscription(businessId: string): Promise<Subscription | null> {
    const sb = createServerSupabaseClient();
    const { data, error } = await sb
      .from("subscriptions")
      .select("*")
      .eq("business_id", businessId)
      .maybeSingle();
    if (error) throw error;
    return (data as Subscription | null) ?? null;
  }

  async upsertSubscription(
    sub: Omit<Subscription, "id" | "created_at"> & { id?: string }
  ): Promise<Subscription> {
    const sb = createServiceRoleClient();
    const payload = {
      ...(sub.id ? { id: sub.id } : {}),
      business_id: sub.business_id,
      stripe_customer_id: sub.stripe_customer_id,
      stripe_subscription_id: sub.stripe_subscription_id,
      plan: sub.plan,
      status: sub.status,
      current_period_end: sub.current_period_end,
      trial_ends_at: sub.trial_ends_at,
    };
    const { data, error } = await sb
      .from("subscriptions")
      .upsert(payload, { onConflict: "business_id" })
      .select()
      .single();
    if (error) throw error;
    return assertRow<Subscription>(data as Subscription, "subscription upsert failed");
  }

  // ---- reviews -------------------------------------------------------------
  async listReviews(businessId: string): Promise<Review[]> {
    const sb = createServerSupabaseClient();
    const { data, error } = await sb
      .from("reviews")
      .select("*")
      .eq("business_id", businessId)
      .order("fetched_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as Review[];
  }

  async upsertReview(
    review: Omit<Review, "id" | "fetched_at"> & { id?: string; fetched_at?: string }
  ): Promise<Review> {
    const sb = createServiceRoleClient();
    const { data, error } = await sb
      .from("reviews")
      .upsert(
        {
          business_id: review.business_id,
          source: review.source,
          external_review_id: review.external_review_id,
          reviewer_name: review.reviewer_name,
          rating: review.rating,
          review_text: review.review_text,
          review_created_at: review.review_created_at,
          status: review.status ?? "new",
          fetched_at: review.fetched_at ?? new Date().toISOString(),
        },
        { onConflict: "business_id,source,external_review_id" }
      )
      .select()
      .single();
    if (error) throw error;
    return assertRow<Review>(data as Review, "review upsert failed");
  }

  async updateReview(id: string, patch: Partial<Review>): Promise<Review> {
    const sb = createServiceRoleClient();
    const { data, error } = await sb
      .from("reviews")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return assertRow<Review>(data as Review, `review ${id} update failed`);
  }

  // ---- replies -------------------------------------------------------------
  async getReplyForReview(reviewId: string): Promise<ReviewReply | null> {
    const sb = createServerSupabaseClient();
    const { data, error } = await sb
      .from("review_replies")
      .select("*")
      .eq("review_id", reviewId)
      .maybeSingle();
    if (error) throw error;
    return (data as ReviewReply | null) ?? null;
  }

  async listRepliesForBusiness(businessId: string): Promise<ReviewReply[]> {
    const sb = createServerSupabaseClient();
    const { data, error } = await sb
      .from("review_replies")
      .select("*, reviews!inner(business_id)")
      .eq("reviews.business_id", businessId);
    if (error) throw error;
    return ((data ?? []) as Array<ReviewReply & { reviews: { business_id: string } }>).map(
      ({ reviews: _reviews, ...reply }) => reply
    );
  }

  async createReply(input: {
    review_id: string;
    draft_text: string | null;
  }): Promise<ReviewReply> {
    const sb = createServiceRoleClient();
    // Upsert by review_id: a review has at most one draft reply.
    const { data: existing } = await sb
      .from("review_replies")
      .select("*")
      .eq("review_id", input.review_id)
      .maybeSingle();
    if (existing) {
      const { data, error } = await sb
        .from("review_replies")
        .update({ draft_text: input.draft_text })
        .eq("id", (existing as ReviewReply).id)
        .select()
        .single();
      if (error) throw error;
      return assertRow<ReviewReply>(data as ReviewReply, "reply update failed");
    }
    const { data, error } = await sb
      .from("review_replies")
      .insert({ review_id: input.review_id, draft_text: input.draft_text })
      .select()
      .single();
    if (error) throw error;
    return assertRow<ReviewReply>(data as ReviewReply, "reply insert failed");
  }

  async updateReply(id: string, patch: Partial<ReviewReply>): Promise<ReviewReply> {
    const sb = createServiceRoleClient();
    const { data, error } = await sb
      .from("review_replies")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return assertRow<ReviewReply>(data as ReviewReply, `reply ${id} update failed`);
  }

  // ---- review requests -----------------------------------------------------
  async listReviewRequests(businessId: string): Promise<ReviewRequest[]> {
    const sb = createServerSupabaseClient();
    const { data, error } = await sb
      .from("review_requests")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as ReviewRequest[];
  }

  async createReviewRequest(
    input: Omit<ReviewRequest, "id" | "created_at" | "status" | "click_token"> & {
      status?: ReviewRequest["status"];
      click_token?: string | null;
    }
  ): Promise<ReviewRequest> {
    const sb = createServiceRoleClient();
    const { data, error } = await sb
      .from("review_requests")
      .insert({
        business_id: input.business_id,
        customer_name: input.customer_name,
        customer_contact: input.customer_contact,
        channel: input.channel,
        message_text: input.message_text,
        sent_at: input.sent_at,
        status: input.status ?? "queued",
        source: input.source,
        entry_method: input.entry_method,
        click_token: input.click_token,
      })
      .select()
      .single();
    if (error) throw error;
    return assertRow<ReviewRequest>(
      data as ReviewRequest,
      "review_request insert failed"
    );
  }

  async updateReviewRequest(
    id: string,
    patch: Partial<ReviewRequest>
  ): Promise<ReviewRequest> {
    const sb = createServiceRoleClient();
    const { data, error } = await sb
      .from("review_requests")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return assertRow<ReviewRequest>(
      data as ReviewRequest,
      `request ${id} update failed`
    );
  }

  // ---- batches -------------------------------------------------------------
  async createBatch(input: {
    business_id: string;
    total_contacts: number;
  }): Promise<ReviewRequestBatch> {
    const sb = createServiceRoleClient();
    const { data, error } = await sb
      .from("review_request_batches")
      .insert({
        business_id: input.business_id,
        total_contacts: input.total_contacts,
      })
      .select()
      .single();
    if (error) throw error;
    return assertRow<ReviewRequestBatch>(
      data as ReviewRequestBatch,
      "batch insert failed"
    );
  }

  async updateBatch(
    id: string,
    patch: Partial<ReviewRequestBatch>
  ): Promise<ReviewRequestBatch> {
    const sb = createServiceRoleClient();
    const { data, error } = await sb
      .from("review_request_batches")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return assertRow<ReviewRequestBatch>(
      data as ReviewRequestBatch,
      `batch ${id} update failed`
    );
  }

  // ---- maintenance ---------------------------------------------------------
  async countRequestsThisMonth(businessId: string): Promise<number> {
    const sb = createServerSupabaseClient();
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const { count, error } = await sb
      .from("review_requests")
      .select("*", { count: "exact", head: true })
      .eq("business_id", businessId)
      .gte("created_at", start.toISOString());
    if (error) throw error;
    return count ?? 0;
  }
}