/**
 * lib/types.ts — shared domain types for ReviewReply-Lite.
 *
 * These mirror supabase/migrations/0001_init.sql exactly so the same shapes are
 * used by the real Supabase client and the local file-backed mock store. Enums
 * are represented as string-literal unions to keep the mock store (which has no
 * Postgres enum enforcement) type-safe.
 */

export type BusinessCategory =
  | "restaurant"
  | "salon"
  | "dental"
  | "retail"
  | "contractor"
  | "other";

export type ReviewSource = "google" | "facebook";

export type SubscriptionPlan = "starter" | "pro" | "enterprise";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled";

export type ReviewStatus = "new" | "draft_generated" | "replied" | "ignored";

export type ReplyStatus = "draft" | "posted" | "failed";
export type ReplyPostedBy = "owner" | "auto";

export type RequestChannel = "sms" | "email";
export type RequestStatus = "queued" | "sent" | "failed" | "clicked";
export type RequestEntryMethod = "quick_add" | "paste_list" | "csv_import";
export type RequestSource = "manual_upload" | "pos_integration" | "csv_import";

export type UserRole = "individual" | "org_admin" | "location_manager";

export interface User {
  id: string;
  email: string;
  auth_provider: string | null;
  role: UserRole;
  created_at: string;
}

export interface Organization {
  id: string;
  name: string;
  owner_user_id: string;
  created_at: string;
}

export interface Business {
  id: string;
  owner_user_id: string;
  organization_id: string | null;
  name: string;
  category: BusinessCategory;
  google_place_id: string | null;
  google_business_profile_account_id: string | null;
  facebook_page_id: string | null;
  google_oauth_token_encrypted: string | null;
  google_oauth_refresh_token_encrypted: string | null;
  facebook_oauth_token_encrypted: string | null;
  brand_voice_notes: string | null;
  timezone: string;
  auto_post_positive_reviews: boolean;
  review_request_template: string;
  notify_new_review_email: boolean;
  notify_new_review_sms: boolean;
  daily_digest: boolean;
  google_review_link: string | null;
  created_at: string;
}

export interface Subscription {
  id: string;
  business_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  current_period_end: string | null;
  trial_ends_at: string | null;
  created_at: string;
}

export interface Review {
  id: string;
  business_id: string;
  source: ReviewSource;
  external_review_id: string;
  reviewer_name: string;
  rating: number; // 1-5
  review_text: string | null;
  review_created_at: string | null;
  status: ReviewStatus;
  fetched_at: string;
}

export interface ReviewReply {
  id: string;
  review_id: string;
  draft_text: string | null;
  final_text: string | null;
  posted_at: string | null;
  posted_by: ReplyPostedBy | null;
  status: ReplyStatus;
  error_message: string | null;
  created_at: string;
}

export interface ReviewRequest {
  id: string;
  business_id: string;
  customer_name: string;
  customer_contact: string;
  channel: RequestChannel;
  message_text: string | null;
  sent_at: string | null;
  status: RequestStatus;
  source: RequestSource;
  entry_method: RequestEntryMethod;
  click_token: string | null;
  created_at: string;
}

export interface ReviewRequestBatch {
  id: string;
  business_id: string;
  uploaded_at: string;
  total_contacts: number;
  sent_count: number;
  failed_count: number;
}

/** Enterprise-ready plan limits expanded for higher MRR potential. */
export const PLAN_LIMITS = {
  starter: { monthlyReviewRequests: 100, facebook: false, sms: false, multiLocation: false },
  pro: { monthlyReviewRequests: 300, facebook: true, sms: true, multiLocation: false },
  enterprise: { monthlyReviewRequests: 2000, facebook: true, sms: true, multiLocation: true },
} as const;

export const PLAN_PRICES = {
  starter: 29,
  pro: 59,
  enterprise: 249,
  overagePerRequest: 0.05,
} as const;

export const TRIAL_DAYS = 14;
export const REVIEW_POLL_INTERVAL_MINUTES = 20;
export const BETA_COHORT_SIZE = 8;
export const AI_MODEL = "claude-sonnet-4-6";