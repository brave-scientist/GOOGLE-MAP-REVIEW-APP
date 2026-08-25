# ReviewReply — Stage-3A Closed Beta Operational Playbook & Support Protocol

**Milestone**: `STAGE-3A-ONBOARDING`  
**Production URL**: `https://reviewreply.pw`  
**Current Release**: `v3.0.0-beta002`

---

## 1. Beta Customer Onboarding Workflow (Wave 1: Customers #1 & #2, Wave 2: Customer #3)

### Supported Beta Capabilities
- **Authentication**: Business Email + Password, Email OTP, Password Reset.
- **Email Delivery**: Resend transactional email (OTP, Reset, Team Invites, Reports).
- **Trial Lifecycle**: 14-day PRO trial with automatic provisioning and downgrade cron.
- **Business Configuration**: Name, address, industry, reply-from email, timezone.
- **Brand Voice**: Custom tone, signature, custom guidelines, prompt injection protection.
- **AI Reply Generation**: One-click contextual AI draft generation in Inbox.
- **Approve & Copy**: Review/edit AI draft, Approve & Copy to clipboard for manual external publishing.
- **Manual External Publishing**: Verified manual publishing workflow to Google, Yelp, Facebook, etc.
- **Review Links & QR**: Public `/review-us/[slug]` multi-platform landing pages and printable QR codes.
- **Team Invitations**: Secure role-based invites (OWNER, ADMIN, MEMBER).
- **Scheduled Reports**: Automated weekly email summaries via `/api/cron/reports`.
- **Admin Operations**: Allowlisted platform admin trial extension and audit log inspection.

### Deferred Capabilities (Post-Beta Roadmap)
- **Google Sign-In**: Deferred (OAuth verification in progress).
- **Google Business Profile Direct Auto-Publishing**: Deferred (Google API verification in progress).
- **Facebook Direct Auto-Publishing**: Deferred (Meta App review in progress).
- **Stripe Billing & Subscriptions**: Deferred (Commercial launch milestone).
- **SMS Review Requests**: Deferred (Twilio / 10DLC registration milestone).

### Step-by-Step Customer Journey
1. **Sign Up**: Navigate to [`https://reviewreply.pw/signup`](https://reviewreply.pw/signup). Enter Name, Email, Password, Business Name, and Industry.
2. **Dashboard Activation**: Customer lands on `/dashboard` with 14-day PRO trial automatically provisioned and 5 seeded sample reviews.
3. **Configure Business Profile & Review Links**:
   - Open `/settings` → **Business**: Set address, reply-from email, and timezone.
   - Open `/review-us-page`: Add Google/Yelp/Facebook review URLs and copy the customer-facing `/review-us/[slug]` link or download the printable QR code.
4. **Tune Brand Voice**:
   - Open `/settings` → **Brand Voice**: Select tone (Professional / Warm / Casual / Empathetic) and configure custom signature or brand guidelines.
5. **Generate & Publish First Reply**:
   - Open `/inbox`. Select any pending review.
   - Click **Generate Draft (AI)**.
   - Review and customize the generated reply.
   - Click **Approve & Copy**.
   - Paste the reply into the actual review platform (Google Business / Yelp / Facebook).
6. **Gather Feedback**: Complete first value loop and record user experience.

---

## 2. Beta Support Triage & SLA Matrix

| Severity | Definition | Response Target | Resolution Target | Action Protocol |
|---|---|---|---|---|
| **P0 — Critical** | Login down, data corruption, tenant isolation breach, security issue | < 15 minutes | < 2 hours | Page CTO, halt deployments, deploy hotfix to Vercel production |
| **P1 — Blocker** | AI draft generation failure, signup provisioning blocked, rate-limiting lockout | < 30 minutes | < 6 hours | Identify root cause, verify in local suite, deploy release |
| **P2 — Friction** | Clipboard copy issue on mobile, UI layout misalignment, email formatting | < 2 hours | < 24 hours | Fix in next sprint patch |
| **P3 — Polish** | Feature requests, minor copy suggestions, non-blocking cosmetic | < 24 hours | Roadmap queue | Log in product feedback backlog |

---

## 3. Real Customer Onboarding Tracking Ledger

| ID | Business / Customer Name | Org ID | Onboard Date | Auth Method | Primary Review Platform | First AI Draft? | First Reply Published? | Support Issues / Notes |
|---|---|---|---|---|---|---|---|---|
| #1 | *(Customer 1)* | — | — | Email / OTP | Google / Yelp | [ ] | [ ] | Pending Wave 1 Invite |
| #2 | *(Customer 2)* | — | — | Email / OTP | Google / Facebook | [ ] | [ ] | Pending Wave 1 Invite |
| #3 | *(Customer 3)* | — | — | Email / OTP | Google / Yelp | [ ] | [ ] | Pending Wave 2 Invite |
| #4 | *(Customer 4)* | — | — | Email / OTP | Google | [ ] | [ ] | Backlog |
| #5 | *(Customer 5)* | — | — | Email / OTP | Google | [ ] | [ ] | Backlog |
| #6 | *(Customer 6)* | — | — | Email / OTP | Google | [ ] | [ ] | Backlog |
| #7 | *(Customer 7)* | — | — | Email / OTP | Google | [ ] | [ ] | Backlog |
| #8 | *(Customer 8)* | — | — | Email / OTP | Google | [ ] | [ ] | Backlog |
| #9 | *(Customer 9)* | — | — | Email / OTP | Google | [ ] | [ ] | Backlog |
| #10| *(Customer 10)*| — | — | Email / OTP | Google | [ ] | [ ] | Backlog |

---

## 4. Production Observability & Reliability Checklist

1. **System Health API**:
   - Endpoint: `GET https://reviewreply.pw/api/health`
   - Verification: Returns `status: "healthy"` and verifies Neon PostgreSQL read connectivity with zero secret leakage.
2. **Error Monitoring (Sentry)**:
   - Client (`sentry.client.config.ts`), Server (`sentry.server.config.ts`), Edge (`sentry.edge.config.ts`) enabled.
   - Captures unhandled runtime exceptions with breadcrumbs and user context sanitized.
3. **Distributed Rate Limiting (Upstash Redis + Memory Fallback)**:
   - Monitored via `@upstash/redis` in `src/lib/rate-limit.ts`.
   - Protects `/api/auth/*` endpoints with user-friendly retry-after headers and actionable error messaging.
4. **Automated Cron Jobs**:
   - Weekly Reports: `GET /api/cron/reports` (Bearer `CRON_SECRET` protected, atomic row claim locking)
   - Trial Lifecycle: `GET /api/cron/downgrade-trials` (Bearer `CRON_SECRET` protected)
