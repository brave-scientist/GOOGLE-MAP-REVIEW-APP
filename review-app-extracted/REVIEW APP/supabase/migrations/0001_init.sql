-- =============================================================================
-- 0001_init.sql — ReviewReply-Lite initial schema
-- =============================================================================
-- Source of truth: Product-Roadmap.md Section 2 (verbatim columns) +
-- Phase 3 entry_method field + Data-Handling-Policy.md Section 2 (PII/encryption).
-- Per AGENTS.md Section 1: schema changes only via numbered migration files.
-- =============================================================================

-- Extensions
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Enums (text-domain CHECK constraints are used so the same schema works on the
-- local file-backed mock store, which does not enforce Postgres enums).
-- ----------------------------------------------------------------------------

-- business category
do $$ begin
  create type business_category as enum ('restaurant','salon','dental','retail','contractor','other');
exception when duplicate_object then null; end $$;

-- review source
do $$ begin
  create type review_source as enum ('google','facebook');
exception when duplicate_object then null; end $$;

-- subscription plan / status
do $$ begin
  create type subscription_plan as enum ('starter','pro');
exception when duplicate_object then null; end $$;
do $$ begin
  create type subscription_status as enum ('trialing','active','past_due','canceled');
exception when duplicate_object then null; end $$;

-- review status
do $$ begin
  create type review_status as enum ('new','draft_generated','replied','ignored');
exception when duplicate_object then null; end $$;

-- reply status / posted_by
do $$ begin
  create type reply_status as enum ('draft','posted','failed');
exception when duplicate_object then null; end $$;
do $$ begin
  create type reply_posted_by as enum ('owner','auto');
exception when duplicate_object then null; end $$;

-- review_request channel / status / entry_method / source
do $$ begin
  create type request_channel as enum ('sms','email');
exception when duplicate_object then null; end $$;
do $$ begin
  create type request_status as enum ('queued','sent','failed','clicked');
exception when duplicate_object then null; end $$;
do $$ begin
  create type request_entry_method as enum ('quick_add','paste_list','csv_import');
exception when duplicate_object then null; end $$;
do $$ begin
  create type request_source as enum ('manual_upload','pos_integration','csv_import');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

-- users (mirror of Supabase auth.users for app joins; populated by trigger)
create table if not exists public.users (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text not null,
  auth_provider   text,
  created_at      timestamptz not null default now()
);

-- businesses
create table if not exists public.businesses (
  id                                   uuid primary key default gen_random_uuid(),
  owner_user_id                        uuid not null references public.users(id) on delete cascade,
  name                                 text not null,
  category                             business_category not null default 'other',
  google_place_id                      text,
  google_business_profile_account_id   text,
  facebook_page_id                     text,
  -- Per Data-Handling-Policy.md 2.1: OAuth tokens must never live in plaintext
  -- columns. Encrypted-at-rest representation is stored here. In mock mode these
  -- hold structurally-valid fake identifiers only.
  google_oauth_token_encrypted         text,
  google_oauth_refresh_token_encrypted text,
  facebook_oauth_token_encrypted       text,
  brand_voice_notes                    text,
  timezone                             text not null default 'America/New_York',
  -- Phase 4: per-business auto-post toggle (off by default; 4-5 star only)
  auto_post_positive_reviews           boolean not null default false,
  -- Phase 3: editable review-request message template per business
  review_request_template              text not null default
    'Hi {customer_name}! Thanks for visiting {business_name}. We''d love your feedback — leave us a quick review here: {review_link}',
  -- Phase 5: notification preferences
  notify_new_review_email              boolean not null default true,
  notify_new_review_sms                boolean not null default false,
  daily_digest                         boolean not null default false,
  google_review_link                   text,
  created_at                           timestamptz not null default now()
);

-- subscriptions
create table if not exists public.subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  business_id              uuid not null references public.businesses(id) on delete cascade,
  stripe_customer_id       text,
  stripe_subscription_id   text,
  plan                     subscription_plan not null default 'starter',
  status                   subscription_status not null default 'trialing',
  current_period_end       timestamptz,
  trial_ends_at            timestamptz,
  created_at               timestamptz not null default now()
);

-- reviews
create table if not exists public.reviews (
  id                  uuid primary key default gen_random_uuid(),
  business_id         uuid not null references public.businesses(id) on delete cascade,
  source              review_source not null,
  external_review_id  text not null,
  reviewer_name       text not null,
  rating              integer not null check (rating between 1 and 5),
  review_text         text,
  review_created_at   timestamptz,
  status              review_status not null default 'new',
  fetched_at          timestamptz not null default now(),
  unique (business_id, source, external_review_id)
);

create index if not exists reviews_business_id_fetched_at_idx
  on public.reviews (business_id, fetched_at desc);

-- review_replies
create table if not exists public.review_replies (
  id            uuid primary key default gen_random_uuid(),
  review_id     uuid not null references public.reviews(id) on delete cascade,
  draft_text    text,
  final_text    text,
  posted_at     timestamptz,
  posted_by     reply_posted_by,
  status        reply_status not null default 'draft',
  error_message text,
  created_at    timestamptz not null default now()
);

create index if not exists review_replies_review_id_idx on public.review_replies (review_id);

-- review_requests
create table if not exists public.review_requests (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  customer_name   text not null,
  -- Per Data-Handling-Policy.md 2.2: end-customer contact is PII; treated as
  -- such (never logged in plaintext, deleted within 30d of cancellation).
  customer_contact text not null,
  channel          request_channel not null default 'sms',
  message_text     text,
  sent_at          timestamptz,
  status           request_status not null default 'queued',
  source           request_source not null default 'manual_upload',
  -- Phase 3 addendum: which entry method produced this row
  entry_method     request_entry_method not null default 'quick_add',
  click_token      text,
  created_at       timestamptz not null default now()
);

create index if not exists review_requests_business_id_created_at_idx
  on public.review_requests (business_id, created_at desc);

-- review_request_batches
create table if not exists public.review_request_batches (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  uploaded_at     timestamptz not null default now(),
  total_contacts  integer not null default 0,
  sent_count      integer not null default 0,
  failed_count    integer not null default 0
);

-- ----------------------------------------------------------------------------
-- Row Level Security
-- A business's owner can read/write all rows that belong to their business.
-- Per Data-Handling-Policy.md Section 3, service-role key bypasses RLS for
-- background jobs; client requests are scoped to the owner.
-- ----------------------------------------------------------------------------

alter table public.users                 enable row level security;
alter table public.businesses            enable row level security;
alter table public.subscriptions         enable row level security;
alter table public.reviews               enable row level security;
alter table public.review_replies        enable row level security;
alter table public.review_requests       enable row level security;
alter table public.review_request_batches enable row level security;

-- users: a user can only see/modify their own row
drop policy if exists "users_self_select" on public.users;
create policy "users_self_select" on public.users
  for select using (auth.uid() = id);

-- businesses: owner full access
drop policy if exists "businesses_owner_all" on public.businesses;
create policy "businesses_owner_all" on public.businesses
  for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

-- helper: is the current user the owner of the business a row belongs to?
-- (used by all child tables)
drop policy if exists "subscriptions_owner_all" on public.subscriptions;
create policy "subscriptions_owner_all" on public.subscriptions
  for all using (
    exists (select 1 from public.businesses b
            where b.id = subscriptions.business_id and b.owner_user_id = auth.uid())
  ) with check (
    exists (select 1 from public.businesses b
            where b.id = subscriptions.business_id and b.owner_user_id = auth.uid())
  );

drop policy if exists "reviews_owner_all" on public.reviews;
create policy "reviews_owner_all" on public.reviews
  for all using (
    exists (select 1 from public.businesses b
            where b.id = reviews.business_id and b.owner_user_id = auth.uid())
  ) with check (
    exists (select 1 from public.businesses b
            where b.id = reviews.business_id and b.owner_user_id = auth.uid())
  );

drop policy if exists "review_replies_owner_all" on public.review_replies;
create policy "review_replies_owner_all" on public.review_replies
  for all using (
    exists (select 1 from public.reviews r
            join public.businesses b on b.id = r.business_id
            where r.id = review_replies.review_id and b.owner_user_id = auth.uid())
  );

drop policy if exists "review_requests_owner_all" on public.review_requests;
create policy "review_requests_owner_all" on public.review_requests
  for all using (
    exists (select 1 from public.businesses b
            where b.id = review_requests.business_id and b.owner_user_id = auth.uid())
  ) with check (
    exists (select 1 from public.businesses b
            where b.id = review_requests.business_id and b.owner_user_id = auth.uid())
  );

drop policy if exists "review_request_batches_owner_all" on public.review_request_batches;
create policy "review_request_batches_owner_all" on public.review_request_batches
  for all using (
    exists (select 1 from public.businesses b
            where b.id = review_request_batches.business_id and b.owner_user_id = auth.uid())
  ) with check (
    exists (select 1 from public.businesses b
            where b.id = review_request_batches.business_id and b.owner_user_id = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- Auto-provision public.users from auth.users on signup
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, auth_provider)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'provider','email'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();