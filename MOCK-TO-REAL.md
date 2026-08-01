# MOCK-TO-REAL.md — ReviewReply-Lite

This document lists exactly what needs to change to convert this mock-mode build into a real, commercially-launchable app. Every change is a credential-and-config swap, not a rewrite.

## 1. Environment Variables

Set `USE_MOCKS=false` in `.env.local` and fill in ALL of these:

| Variable | Purpose | Where to Get It |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Supabase dashboard → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | Same |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | Same (keep secret!) |
| `ANTHROPIC_API_KEY` | Claude API key | console.anthropic.com |
| `GOOGLE_OAUTH_CLIENT_ID` | Google OAuth client ID | Google Cloud Console |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google OAuth client secret | Same |
| `GOOGLE_BUSINESS_PROFILE_API_KEY` | GBP API key | Google Cloud Console (enable Business Profile API) |
| `FACEBOOK_APP_ID` | Meta app ID | Meta Developer dashboard |
| `FACEBOOK_APP_SECRET` | Meta app secret | Same |
| `TWILIO_ACCOUNT_SID` | Twilio account SID | Twilio console |
| `TWILIO_AUTH_TOKEN` | Twilio auth token | Same |
| `TWILIO_PHONE_NUMBER` | Twilio purchased number | Same (requires 10DLC registration) |
| `RESEND_API_KEY` | Resend API key | resend.com (requires domain verification) |
| `STRIPE_SECRET_KEY` | Stripe secret key | Stripe dashboard (live mode) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | Stripe dashboard → Webhooks |
| `STRIPE_PRICE_ID_STARTER` | Stripe Price ID for $29/mo | Stripe dashboard → Products |
| `STRIPE_PRICE_ID_PRO` | Stripe Price ID for $59/mo | Same |
| `STRIPE_PRICE_ID_OVERAGE` | Stripe metered Price ID ($0.05/unit) | Same |
| `INNGEST_EVENT_KEY` | Inngest event key | Inngest dashboard |
| `INNGEST_SIGNING_KEY` | Inngest signing key | Same |
| `NEXT_PUBLIC_APP_URL` | Your production URL | Your domain |

## 2. File-by-File Changes

Each integration file already has the real API call code written (below the mock check). Flipping `USE_MOCKS=false` activates them.

### `lib/integrations/google-business-profile.ts`
- ✅ Real `fetchReviews()` and `postReply()` code is present (lines below the mock check).
- **Action needed**: Complete the `accountId` resolution in `fetchReviews()` (currently empty string). Pass it from the business record.

### `lib/integrations/facebook-graph.ts`
- ✅ Real `fetchPageRatings()` and `postReply()` code is present.
- **Action needed**: Implement the real `postReply()` body (currently throws — needs page token + story ID resolution).

### `lib/integrations/twilio.ts`
- ✅ Real `sendSms()` code is present (Twilio REST API with Basic auth).
- **No changes needed** — just set the env vars.

### `lib/integrations/resend.ts`
- ✅ Real `sendEmail()` code is present.
- **Action needed**: Update the `from` address to your verified domain.

### `lib/integrations/stripe.ts`
- ✅ Real Stripe SDK code is present for `createCheckoutSession`, `changePlan`, `cancelSubscription`, `reportOverageUsage`, `createPortalSession`.
- **No changes needed** — just set the env vars and create the Products/Prices in Stripe.

### `lib/ai/draft-reply.ts`
- ✅ Real Anthropic Claude API call is present (`callAnthropic()` function).
- **No changes needed** — just set `ANTHROPIC_API_KEY`.

### `lib/supabase/supabase-store.ts`
- ✅ Fully implemented against real Supabase.
- **Action needed**: Run `supabase/migrations/0001_init.sql` against your Supabase project.

### OAuth Connect Flows
- **Current**: Mock connect (pick from seeded locations/pages).
- **Action needed**: Build real OAuth redirect flows at:
  - `app/api/webhooks/google-oauth-callback/route.ts`
  - `app/api/webhooks/facebook-oauth-callback/route.ts`
  - Update `OnboardingForm.tsx` step 3 to redirect to real OAuth consent screens.

### `app/api/billing/checkout/route.ts`
- **Current**: Finalizes subscription directly in mock mode.
- **Action needed**: Restore the real Stripe Checkout redirect (the `createCheckoutSession` code already returns a real URL when `USE_MOCKS=false`).

## 3. Infrastructure Setup (Phase 0 items skipped in mock build)

1. **Google Cloud**: Create project, enable Business Profile API, submit for approval (1-3 weeks).
2. **Meta Developer**: Create app, add Pages product, request permissions, submit for App Review.
3. **Twilio**: Purchase number, complete 10DLC brand + campaign registration.
4. **Resend**: Verify sending domain (SPF/DKIM/DMARC DNS records).
5. **Stripe**: Create account, create Products (Starter $29, Pro $59, Overage metered).
6. **Inngest**: Connect to Vercel project.
7. **Supabase**: Create project, run migration, set up auth.
8. **Sentry**: Create project, install SDK.
9. **PostHog**: Create project, install SDK.

## 4. Observability (optionally skipped)

The following were stubbed/skipped in mock mode:
- **Sentry**: Set `SENTRY_DSN` and install `@sentry/nextjs`.
- **PostHog**: Set `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST`, install SDK.
- **Better Uptime**: Add a monitor pointed at your production URL.

## 5. Legal

Replace placeholder Terms of Service and Privacy Policy with professionally-reviewed versions before launch.