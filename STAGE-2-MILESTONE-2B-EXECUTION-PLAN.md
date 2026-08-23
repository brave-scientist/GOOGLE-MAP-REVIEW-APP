# ReviewReply — Stage 2 Milestone 2B Master Execution Plan
## Product UI & Subsystem Integration Architecture

- **Document Version:** 1.0.0 (Forensic Audit & CTO Implementation Specification)
- **Target File Location:** `/STAGE-2-MILESTONE-2B-EXECUTION-PLAN.md`
- **Canonical Baseline Commit:** `bef6d6814853624403f3dcd21e294481af3e96a2`
- **Planning Authority:** CTO / Principal Architect Direction
- **Implementation Status:** NO CODE CHANGES YET (Read-Only Forensic Audit Phase)
- **Preceding Gate:** Milestone 2A (Product Persistence Foundation) — GREEN & CLEARED

---

## 1. Executive Summary

Stage 2 Milestone 2A successfully established the persistent database models, relational schema constraints, cryptographic token generation engine, and automated regression test suites for Competitor Intelligence (`Competitor`, `CompetitorSnapshot`), Scheduled Reports (`ScheduledReport`), and Team Invitations (`TeamInvitation`).

However, a strict forensic audit of the repository reveals that **the frontend client layer remains largely disconnected from these persistent backend subsystems**, and **critical edge-routing barriers exist in the Next.js middleware**. Specifically:
1. **Frontend Disconnection:** The Reports UI ([`src/app/reports/page.tsx`](file:///c:/WEB%20APP/REVIEW%20REPLY/src/app/reports/page.tsx)), Settings Team Members tab ([`src/app/settings/page.tsx`](file:///c:/WEB%20APP/REVIEW%20REPLY/src/app/settings/page.tsx)), and Competitor Benchmark UI ([`src/app/competitors/page.tsx`](file:///c:/WEB%20APP/REVIEW%20REPLY/src/app/competitors/page.tsx)) contain hardcoded mock objects or incomplete API bindings instead of consuming the live database endpoints built in Milestone 2A.
2. **Critical Middleware Ingestion Blockers:** [`src/middleware.ts`](file:///c:/WEB%20APP/REVIEW%20REPLY/src/middleware.ts) lacks public route exemptions for `/invite/accept`, `/forgot-password`, `/reset-password`, `/api/auth/forgot-password`, `/api/auth/reset-password`, `/api/team/invite/verify`, `/api/team/invite/accept`, `/api/webhooks/stripe`, and `/api/cron/downgrade-trials`. Consequently, unauthenticated invited users, password reset recipients, incoming Stripe webhooks, and Vercel cron jobs are prematurely blocked with HTTP 401 or redirected before reaching their respective route handlers.
3. **Missing Team Management APIs:** While `POST /api/team/invite` issues tokens, endpoints for listing active organization members (`GET /api/team/members`), revoking pending invitations (`DELETE /api/team/invite/[id]`), and removing members (`DELETE /api/team/members/[id]`) do not exist.
4. **Missing Report Dispatch Engine:** The database stores scheduled report configurations, but there is no cron runner ([`src/app/api/cron/reports/route.ts`](file:///c:/WEB%20APP/REVIEW%20REPLY/src/app/api/cron/reports/route.ts)) to evaluate schedules (`DAILY`, `WEEKLY`, `MONTHLY`), generate digest summaries, and dispatch outbound emails via Resend.

Milestone 2B is the **Product UI & Subsystem Integration phase** that resolves these disconnections, eliminates middleware routing dead-ends, introduces complete team membership lifecycle operations, builds the automated report dispatch engine, and delivers an end-to-end connected SaaS experience without mock fallbacks.

---

## 2. Scope of Milestone 2B

### In Scope (Canonical Scope for 2B):
- **Middleware Whitelist Hardening:** Extend `PUBLIC_ROUTES` and `PUBLIC_API_ROUTES` in `src/middleware.ts` to allow unauthenticated access to password recovery, team invite acceptance/verification, Stripe webhooks, and Bearer-authenticated cron endpoints.
- **Team Management & Settings Integration:**
  - Build `GET /api/team/members` (returns active `OrgMember`s and pending `TeamInvitation`s).
  - Build `DELETE /api/team/invite/[id]` (revoke pending invite).
  - Build `DELETE /api/team/members/[id]` (remove team member with owner protection).
  - Connect `src/app/settings/page.tsx` Team tab to fetch, render, invite, and revoke live members and pending invitations.
- **Scheduled Reports UI & CRUD Full-Loop:**
  - Connect `src/app/reports/page.tsx` to `GET /api/reports`, `POST /api/reports/create`, `PUT /api/reports/create`, and `DELETE /api/reports/[id]`.
  - Wire `NewReportModal` and `EditReportModal` in `src/components/app/admin-modals.tsx` with live schedule, format, and recipient data.
  - Implement active/paused status toggling and deletion in UI.
- **Automated Report Dispatch Cron Engine:**
  - Implement `GET /api/cron/reports/route.ts` protected by `CRON_SECRET` Bearer auth.
  - Query active `ScheduledReport` records where `lastSentAt` matches the schedule frequency (`DAILY`, `WEEKLY`, `MONTHLY`).
  - Generate HTML review summary digest and dispatch via `src/lib/integrations/resend.ts`.
  - Atomically update `lastSentAt` and log audit events.
- **Competitor Intelligence UI Full-Loop:**
  - Connect `src/app/competitors/page.tsx` to dynamically fetch current business metrics for the "You" benchmark row instead of hardcoded strings.
  - Wire delete competitor action to `DELETE /api/competitors`.
- **Milestone 2B Test Suite & E2E Validation:**
  - Expand test suites (`scripts/test-stage2.ts` and `scripts/test-e2e-journeys.ts`) to verify all new endpoints, middleware routes, team management operations, and report dispatch logic.

### Out of Scope (Deferred to Vendor / Post-2B Phases):
- Live Google GBP OAuth project verification (Externally blocked on Google Cloud Console).
- Live Meta App Review permissions for `pages_read_engagement` (Externally blocked on Meta).
- Live Twilio A2P 10DLC carrier vetting (Externally blocked on carrier review).
- White-label custom domain routing on Vercel (Deferred to Stage 5).

---

## 3. Evidence Hierarchy

In accordance with strict CTO governance, the following precedence order is enforced:
1. **Current Repository Source Code:** (`src/**`, `prisma/**`, `package.json`).
2. **Current Prisma Schema & Migrations:** (`prisma/schema.prisma`, `prisma/migrations/20260823_stage2_milestone_2a_persistence/migration.sql`).
3. **Current Automated Tests:** (`scripts/test-stage1.ts`, `scripts/test-stage2.ts`, `scripts/test-e2e-journeys.ts`).
4. **Current Configuration:** (`next.config.ts`, `tsconfig.json`, `vercel.json`).
5. **Current ROADMAP.md:** (`ROADMAP.md` v2.2.1).
6. **Existing Execution Plans & Historical Documents:** (`STAGE-2-CTO-RATIFIED.md`, `STAGE-2-MILESTONE-2A-IMPLEMENTATION.md`).

---

## 4. Current-State Assessment

| Area / File | Current Status | Forensic Evidence | Target State in 2B |
|---|---|---|---|
| **Middleware Whitelist**<br>[`src/middleware.ts`](file:///c:/WEB%20APP/REVIEW%20REPLY/src/middleware.ts#L6-L35) | **BROKEN (P0)** | `PUBLIC_ROUTES` & `PUBLIC_API_ROUTES` omit `/forgot-password`, `/reset-password`, `/invite/accept`, `/api/auth/forgot-password`, `/api/auth/reset-password`, `/api/team/invite/verify`, `/api/team/invite/accept`, `/api/webhooks/stripe`, `/api/cron/*`. | Add all public authentication, webhook, invite, and cron routes to explicit whitelist. |
| **Team Management APIs**<br>`src/app/api/team/` | **PARTIAL (P1)** | Only `POST /api/team/invite`, `POST /api/team/invite/accept`, and `POST /api/team/invite/verify` exist. No list or deletion endpoints. | Create `GET /api/team/members`, `DELETE /api/team/invite/[id]`, and `DELETE /api/team/members/[id]`. |
| **Settings Team UI**<br>[`src/app/settings/page.tsx:L440-455`](file:///c:/WEB%20APP/REVIEW%20REPLY/src/app/settings/page.tsx#L440-L455) | **BROKEN (P1)** | Hardcoded static members (`Sarah Chen`, `Marcus Webb`, `Priya Patel`). Zero API calls to fetch real team members or pending invites. | Fetch real members and pending invitations from `GET /api/team/members`; provide invite and revoke UI controls. |
| **Reports Page UI**<br>[`src/app/reports/page.tsx:L67-104`](file:///c:/WEB%20APP/REVIEW%20REPLY/src/app/reports/page.tsx#L67-L104) | **BROKEN (P1)** | Hardcoded mock report cards. No `useEffect` or `fetch('/api/reports')`. `NewReportModal` creates reports in DB, but page never displays them. | Fetch and render live `ScheduledReport` records from `/api/reports`; wire status toggling (Active/Paused) and deletion. |
| **Report Dispatch Cron**<br>`src/app/api/cron/reports/route.ts` | **NOT IMPLEMENTED (P1)** | File does not exist. Reports are configured in DB but never evaluated or dispatched automatically. | Build cron route checking due reports, formatting HTML email digests, and dispatching via Resend. |
| **Competitors Page UI**<br>[`src/app/competitors/page.tsx:L49-59`](file:///c:/WEB%20APP/REVIEW%20REPLY/src/app/competitors/page.tsx#L49-L59) | **PARTIAL (P2)** | Fetches `/api/competitors`, but "You" baseline row is hardcoded to "Bamboo Garden (You)". Delete competitor UI not wired to API. | Dynamically populate "You" row from active business metrics (`Business.avgRating`, `Business.reviewCount`); wire delete button. |
| **Admin Modals**<br>[`src/components/app/admin-modals.tsx:L258-300`](file:///c:/WEB%20APP/REVIEW%20REPLY/src/components/app/admin-modals.tsx#L258-L300) | **PARTIAL (P2)** | `NewReportModal` exists and calls `/api/reports/create`. `EditReportModal` is stubbed and not wired to `PUT /api/reports/create`. | Fully wire `EditReportModal` to update report configurations in DB. |

---

## 5. Milestone 2B Feature Matrix

| ID | Roadmap / Architecture Requirement | Current Evidence | Status | Missing Work in 2B | Dependencies | Risk |
|---|---|---|---|---|---|---|
| **SEC-MID-01** | Middleware Whitelist for Unauthenticated Public Endpoints | `src/middleware.ts` lines 6–35 | **BROKEN** | Add invite, password reset, stripe webhook, and cron routes to middleware whitelist | None | **P0** (Blocks user onboarding & webhook delivery) |
| **TEAM-API-01**| Team Members & Invitations Listing API | Missing in `src/app/api/team/` | **NOT IMPLEMENTED** | Build `GET /api/team/members` returning `members` and `pendingInvitations` | `TeamInvitation`, `OrgMember` | **P1** (Cannot view active/pending team) |
| **TEAM-API-02**| Revoke Pending Invitation API | Missing in `src/app/api/team/` | **NOT IMPLEMENTED** | Build `DELETE /api/team/invite/[id]` with role verification | `TeamInvitation` | **P1** (Cannot revoke rogue invites) |
| **TEAM-API-03**| Remove Team Member API | Missing in `src/app/api/team/` | **NOT IMPLEMENTED** | Build `DELETE /api/team/members/[id]` with owner protection | `OrgMember` | **P1** (Cannot remove offboarded staff) |
| **TEAM-UI-01** | Live Team Management UI in Settings | `src/app/settings/page.tsx` lines 430–458 | **BROKEN** | Connect Settings Team tab to `/api/team/members`, wire invite modal refresh & revoke actions | `TEAM-API-01`, `TEAM-API-02` | **P1** (UI displays fake team data) |
| **RPT-UI-01**  | Live Scheduled Reports UI Dashboard | `src/app/reports/page.tsx` lines 67–104 | **BROKEN** | Replace static cards with `fetch('/api/reports')`, wire status toggling and deletion | `ScheduledReport` | **P1** (UI displays fake reports) |
| **RPT-CRON-01**| Automated Report Dispatch Cron Engine | Missing in `src/app/api/cron/` | **NOT IMPLEMENTED** | Implement `GET /api/cron/reports/route.ts` with `CRON_SECRET` auth and email generation | `ScheduledReport`, `Resend` | **P1** (Reports never sent automatically) |
| **COMP-UI-01** | Live Competitor Benchmark UI & Deletion | `src/app/competitors/page.tsx` lines 49–59 | **PARTIAL** | Fetch real business stats for "You" row; wire trash icon to `DELETE /api/competitors` | `Competitor` | **P2** (Competitor comparison uses hardcoded name) |
| **TEST-2B-01** | Automated Test Suite for Milestone 2B | `scripts/test-stage2.ts` | **READY FOR EXPANSION** | Add automated integration tests for middleware routing, team listing/revocation, and report cron | All 2B features | **P1** (Regression prevention) |

---

## 6. Backend Implementation Plan

### 6.1 Middleware Whitelist Expansion (`src/middleware.ts`)
- **Action:** Update `PUBLIC_ROUTES` to include:
  - `'/forgot-password'`
  - `'/reset-password'`
  - `'/invite/accept'`
- **Action:** Update `PUBLIC_API_ROUTES` to include:
  - `'/api/auth/forgot-password'`
  - `'/api/auth/reset-password'`
  - `'/api/team/invite/verify'`
  - `'/api/team/invite/accept'`
  - `'/api/webhooks/stripe'`
  - `'/api/cron/downgrade-trials'`
  - `'/api/cron/reports'`

### 6.2 Team Management APIs
#### 1. `GET /api/team/members` (`src/app/api/team/members/route.ts`)
- **Auth:** `getTenantContext(request)`.
- **Query:**
  - Fetch all `OrgMember` where `orgId === ctx.orgId`, include `user: { select: { id, email, name, avatarUrl, createdAt } }`.
  - Fetch all `TeamInvitation` where `orgId === ctx.orgId` and `consumedAt === null` and `expiresAt > now()`.
- **Response:**
  ```json
  {
    "members": [
      { "id": "mem_1", "userId": "usr_1", "name": "Sarah Chen", "email": "owner@bamboogarden.com", "role": "OWNER", "createdAt": "..." }
    ],
    "pendingInvitations": [
      { "id": "inv_1", "email": "manager@bamboogarden.com", "role": "ADMIN", "expiresAt": "...", "createdAt": "..." }
    ],
    "seatLimit": 5,
    "seatsUsed": 1
  }
  ```

#### 2. `DELETE /api/team/invite/[id]` (`src/app/api/team/invite/[id]/route.ts`)
- **Auth:** `getTenantContext(request)`.
- **Role Check:** Only `OWNER` or `ADMIN` can revoke invitations.
- **Action:** Delete `TeamInvitation` where `id === id` and `orgId === ctx.orgId`.
- **Audit Log:** Log `team.invitation_revoked`.

#### 3. `DELETE /api/team/members/[id]` (`src/app/api/team/members/[id]/route.ts`)
- **Auth:** `getTenantContext(request)`.
- **Role Check:** Only `OWNER` (or `ADMIN` removing non-admins) can remove members.
- **Safety Invariant:** Cannot remove the organization `OWNER`. Cannot remove self if last owner.
- **Action:** Delete `OrgMember` where `id === id` and `orgId === ctx.orgId`.
- **Audit Log:** Log `team.member_removed`.

### 6.3 Scheduled Reports Deletion API (`src/app/api/reports/[id]/route.ts`)
- **Auth:** `getTenantContext(request)`.
- **Role Check:** Only `OWNER` or `ADMIN` can delete reports.
- **Action:** Delete `ScheduledReport` where `id === id` and `orgId === ctx.orgId`.
- **Audit Log:** Log `report.deleted`.

### 6.4 Automated Report Dispatch Engine (`src/app/api/cron/reports/route.ts`)
- **Auth:** `CRON_SECRET` Bearer header validation (fail closed).
- **Execution Flow:**
  1. Calculate time windows for `DAILY` (past 24h), `WEEKLY` (past 7d), `MONTHLY` (past 30d).
  2. Query all `ScheduledReport` records with `status === ACTIVE`.
  3. Filter reports due for execution based on `lastSentAt` and frequency.
  4. For each due report:
     - Fetch reviews, avg rating, and pending drafts for associated `businessId` or entire `orgId`.
     - Compile HTML digest email template.
     - Parse recipient list (`JSON.parse(report.recipients)`).
     - Dispatch email via `src/lib/integrations/resend.ts` (`sendEmail`).
     - Atomically update `lastSentAt = new Date()`.
     - Log `report.dispatched` in `AuditLog`.
  5. Return execution summary `{ processed: N, dispatched: M, errors: [] }`.

---

## 7. Frontend Implementation Plan

### 7.1 Settings Team Tab Integration (`src/app/settings/page.tsx`)
- Add state `const [teamData, setTeamData] = useState<{ members: any[]; pendingInvitations: any[] } | null>(null)`.
- Fetch `GET /api/team/members` on tab mount and after successful invitation.
- Render active members with initials/avatar, role badge, joined date, and "Remove" button (for authorized users).
- Render a dedicated "Pending Invitations" section with email, role, expiration, and a "Revoke" button.
- Wire `InviteMemberModal` to trigger `fetchTeamMembers()` upon successful invite.

### 7.2 Scheduled Reports Page Integration (`src/app/reports/page.tsx`)
- Add state `const [reports, setReports] = useState<Report[]>([])` and `loading`.
- Fetch `GET /api/reports` on mount.
- Render empty state when `reports.length === 0` with a "Create your first report" CTA.
- Render live cards displaying real name, schedule frequency badge, format badge, recipient count, last sent timestamp, and status.
- Add "Pause / Resume" toggle calling `PUT /api/reports/create` with `status: ACTIVE | PAUSED`.
- Add "Delete" button calling `DELETE /api/reports/[id]` with confirmation toast.
- Wire `NewReportModal` and `EditReportModal` to refresh the report list on completion.

### 7.3 Competitors Page UI Integration (`src/app/competitors/page.tsx`)
- Update `fetchCompetitors` to fetch the primary business from `/api/dashboard` or `/api/businesses` to populate the "You" row with real name, real rating, and real review count.
- Add trash button on competitor rows calling `DELETE /api/competitors` with `{ competitorId: id }`.
- Optimistically update or refetch competitor list on deletion.

---

## 8. API Contract Registry (Milestone 2B)

| Endpoint | Method | Auth Scheme | Required Role | Tenant Scoping | Request Payload Shape | Success Response (HTTP 200/201) | Error Codes | Implementation Status |
|---|---|---|---|---|---|---|---|---|
| `/api/team/members` | `GET` | `rr_session` JWT | Any Member | `orgId` | None | `{ members: OrgMember[], pendingInvitations: TeamInvitation[], seatLimit: number, seatsUsed: number }` | `401 UNAUTHORIZED`, `500` | **TO BUILD** |
| `/api/team/invite/[id]` | `DELETE` | `rr_session` JWT | `OWNER`, `ADMIN` | `orgId` | None | `{ success: true, message: "Invitation revoked" }` | `401`, `403 INSUFFICIENT_ROLE`, `404 NOT_FOUND` | **TO BUILD** |
| `/api/team/members/[id]` | `DELETE` | `rr_session` JWT | `OWNER`, `ADMIN` | `orgId` | None | `{ success: true, message: "Member removed" }` | `401`, `403 INSUFFICIENT_ROLE`, `400 CANNOT_REMOVE_OWNER`, `404` | **TO BUILD** |
| `/api/reports/[id]` | `DELETE` | `rr_session` JWT | `OWNER`, `ADMIN` | `orgId` | None | `{ success: true, message: "Report deleted" }` | `401`, `403`, `404 NOT_FOUND` | **TO BUILD** |
| `/api/cron/reports` | `GET` | Bearer `CRON_SECRET` | System Cron | Platform | None | `{ processed: number, dispatched: number, errors: string[] }` | `401 UNAUTHORIZED`, `500` | **TO BUILD** |
| `/api/reports` | `GET` | `rr_session` JWT | Any Member | `orgId` | Query: `status?` | `{ reports: ScheduledReport[] }` | `401`, `500` | **EXISTING (2A)** |
| `/api/reports/create` | `POST` | `rr_session` JWT | `OWNER`, `ADMIN` | `orgId` | `{ name, schedule, recipients, format, businessId? }` | `{ success: true, report: ScheduledReport }` | `400`, `401`, `403`, `500` | **EXISTING (2A)** |
| `/api/reports/create` | `PUT` | `rr_session` JWT | `OWNER`, `ADMIN` | `orgId` | `{ reportId, name?, schedule?, recipients?, format?, status? }` | `{ success: true, report: ScheduledReport }` | `400`, `401`, `404`, `500` | **EXISTING (2A)** |
| `/api/competitors` | `DELETE` | `rr_session` JWT | `OWNER`, `ADMIN` | `businessId` | Query/Body: `{ competitorId }` | `{ success: true, message: "Competitor deleted" }` | `400`, `401`, `403`, `404` | **EXISTING (2A)** |

---

## 9. Database Audit & Schema Invariants

### 9.1 Existing Schema Sufficiency
The schema established in Milestone 2A (`prisma/migrations/20260823_stage2_milestone_2a_persistence/migration.sql`) **fully supports all Milestone 2B requirements**:
- `TeamInvitation` table contains `id`, `orgId`, `email`, `role`, `tokenHash`, `invitedById`, `expiresAt`, `consumedAt`, `createdAt` with index on `[orgId, email]`.
- `OrgMember` table contains `id`, `orgId`, `userId`, `role`, `createdAt` with unique constraint on `[orgId, userId]`.
- `ScheduledReport` table contains `id`, `orgId`, `businessId`, `name`, `schedule`, `recipients`, `format`, `status`, `lastSentAt`, `createdAt`, `updatedAt` with index on `[orgId, status]`.
- `Competitor` and `CompetitorSnapshot` tables contain all necessary tracking fields and cascade relations.

### 9.2 Migration Action in 2B:
- **Zero new migrations required.** The schema is 100% complete and verified. No database structural modifications are needed for Milestone 2B.

---

## 10. Security Audit & Invariants

### 10.1 Role-Based Access Control (RBAC) Invariants:
1. **Team Invitation Creation & Revocation:** Only `OWNER` and `ADMIN` can invite or revoke. `STAFF` and `VIEWER` receive HTTP 403 `INSUFFICIENT_ROLE`.
2. **Member Deletion Safeguard:** An `OWNER` cannot be deleted from `OrgMember`. An `ADMIN` cannot delete another `ADMIN` or `OWNER` (only `OWNER` can remove administrators).
3. **Tenant Boundary Lockdown:** All queries (`OrgMember`, `TeamInvitation`, `ScheduledReport`, `Competitor`) filter strictly by `ctx.orgId` or `ctx.businessIds`. Cross-tenant IDOR returns 404/403.

### 10.2 Public Route & Unauthenticated Access Invariants:
1. **Invite Acceptance Flow:** `/invite/accept` and `/api/team/invite/verify` are public to allow unauthenticated invitees to view their invitation status.
2. **Token Security:** Raw tokens are never logged or stored; only SHA-256 hashes are persisted and queried.
3. **Cron Job Lockdown:** `/api/cron/reports` and `/api/cron/downgrade-trials` require `Authorization: Bearer <CRON_SECRET>` and fail closed if `CRON_SECRET` is unset.

---

## 11. Integration Audit & Boundary Matrix

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   MILESTONE 2B INTEGRATION BOUNDARIES                            │
├────────────┬──────────────────┬─────────────────┬───────────────────┬────────────────────────────┤
│ Service    │ Protocol / SDK   │ Auth / Secret   │ Operational Mode  │ Fallback / Mock Behavior   │
├────────────┼──────────────────┼─────────────────┼───────────────────┼────────────────────────────┤
│ Resend     │ REST API / SDK   │ RESEND_API_KEY  │ Outbound Emails   │ If unset: logs email to    │
│            │                  │                 │ (Reports & Invites│ stdout/audit without crash │
├────────────┼──────────────────┼─────────────────┼───────────────────┼────────────────────────────┤
│ Stripe     │ Webhook Listener │ WEBHOOK_SECRET  │ Subscription Sync │ Idempotent event ledger    │
│            │ (Stripe-Signature│                 │                   │ prevents duplicate updates │
├────────────┼──────────────────┼─────────────────┼───────────────────┼────────────────────────────┤
│ Vercel Cron│ HTTP Scheduled   │ CRON_SECRET     │ Daily / Hourly    │ Invocable manually via API │
│            │ Trigger          │                 │ Runner            │ with Bearer header         │
├────────────┼──────────────────┼─────────────────┼───────────────────┼────────────────────────────┤
│ Google GBP │ REST API v4      │ AES-256 OAuth   │ Externally Blocked│ Mock dispatch in test/dev  │
├────────────┼──────────────────┼─────────────────┼───────────────────┼────────────────────────────┤
│ Meta Graph │ Graph API v19    │ AES-256 OAuth   │ Externally Blocked│ Mock dispatch in test/dev  │
└────────────┴──────────────────┴─────────────────┴───────────────────┴────────────────────────────┘
```

---

## 12. Automated Test Strategy

The test suite will be expanded in `scripts/test-stage2.ts` to provide 100% automated coverage across all Milestone 2B additions:

### Test Groups:
1. **Middleware Whitelist Suite:**
   - Verify unauthenticated requests to `/forgot-password`, `/reset-password`, and `/invite/accept` return 200 without login redirects.
   - Verify unauthenticated POST to `/api/team/invite/verify` and `/api/team/invite/accept` reach route handlers.
   - Verify unauthenticated POST to `/api/webhooks/stripe` reaches webhook handler without session cookie.
2. **Team Management Operations Suite:**
   - `GET /api/team/members`: Verify returns active members and pending invitations scoped to organization.
   - `DELETE /api/team/invite/[id]`: Verify deletes pending invitation and blocks cross-tenant revocation.
   - `DELETE /api/team/members/[id]`: Verify removes member, rejects owner removal, and enforces role hierarchy.
3. **Scheduled Reports CRUD & Cron Suite:**
   - `GET /api/reports`: Verify returns all reports for tenant.
   - `DELETE /api/reports/[id]`: Verify deletes report.
   - `GET /api/cron/reports`: Verify Bearer auth fail-closed, due report filtering, and `lastSentAt` update.
4. **Competitor Benchmark Integration Suite:**
   - Verify `DELETE /api/competitors` deletes competitor and associated snapshots.

---

## 13. End-to-End User Journey Models (Milestone 2B)

### Journey 1: Team Member Invitation, Acceptance & Management
```
[Admin in Settings → Team] ──► [Clicks "Invite Member"] ──► [Submits email + role]
       │
       ▼
[POST /api/team/invite] ──► [Generates Token + SHA-256 Hash] ──► [Sends Email via Resend]
       │
       ▼
[Settings Page Updates] ──► [Displays email under "Pending Invitations"]
       │
       ▼
[Invitee Receives Email] ──► [Clicks Link: /invite/accept?token=XYZ]
       │
       ▼
[Middleware Checks Route] ──► [Permits Unauthenticated Access (Whitelisted)]
       │
       ▼
[POST /api/team/invite/verify] ──► [Token Valid] ──► [Renders Set Password Form]
       │
       ▼
[Invitee Sets Password] ──► [POST /api/team/invite/accept]
       │
       ▼
[Atomic Transaction: User Created + OrgMember Created + Token Consumed + Session Minted]
       │
       ▼
[Invitee Navigates /dashboard]
       │
       ▼
[Admin Refreshes Settings → Team] ──► [Invitee now appears under "Active Members", removed from Pending]
```

### Journey 2: Scheduled Report Creation, Management & Automated Dispatch
```
[User in /reports] ──► [Clicks "New report"] ──► [Enters Name, Weekly, Email, Recipients]
       │
       ▼
[POST /api/reports/create] ──► [Persists in ScheduledReport DB]
       │
       ▼
[Reports Dashboard Refreshes] ──► [Displays Live Report Card with "Active" Badge]
       │
       ▼
[User Clicks "Pause"] ──► [PUT /api/reports/create status=PAUSED] ──► [Badge changes to "Paused"]
       │
       ▼
[User Clicks "Resume"] ──► [PUT /api/reports/create status=ACTIVE] ──► [Badge changes to "Active"]
       │
       ▼
[Vercel Cron Trigger] ──► [GET /api/cron/reports with Bearer CRON_SECRET]
       │
       ▼
[Evaluates Due Reports] ──► [Compiles Review Digest HTML] ──► [Dispatches Email via Resend]
       │
       ▼
[Atomically Updates lastSentAt = now()] ──► [Logs report.dispatched in AuditLog]
```

---

## 14. Environment Configuration Register

| Variable Name | Status in Code | Expected Environment | Purpose |
|---|---|---|---|
| `DATABASE_URL` | Referenced | Production / Staging | PostgreSQL connection string |
| `SESSION_SECRET` | Referenced | Production / Staging | Secret key for JWT signing (`jose`) |
| `ENCRYPTION_KEY` | Referenced | Production / Staging | 32-byte hex key for AES-256 token encryption |
| `CRON_SECRET` | Referenced | Production / Staging | Secret Bearer token for Vercel cron authorization |
| `RESEND_API_KEY` | Referenced | Production / Staging | Email dispatch for invites and reports |
| `NEXT_PUBLIC_APP_URL`| Referenced | Production / Staging | Base URL for invitation links (`https://app.reviewreply.com`) |
| `ADMIN_EMAILS` | Referenced | Production / Staging | Allowlist for platform owner administration |

---

## 15. Implementation Dependency Graph

```mermaid
graph TD
    MW["1. Middleware Whitelist Fixes (src/middleware.ts)"]
    
    subgraph Track 1: Team Management
        T1["GET /api/team/members"]
        T2["DELETE /api/team/invite/[id]"]
        T3["DELETE /api/team/members/[id]"]
        T4["Settings Team Tab UI Integration"]
        T1 & T2 & T3 --> T4
    end

    subgraph Track 2: Scheduled Reports
        R1["DELETE /api/reports/[id]"]
        R2["Reports Page UI Live Binding"]
        R3["Automated Report Dispatch Cron (api/cron/reports)"]
        R1 --> R2
        R1 --> R3
    end

    subgraph Track 3: Competitor Benchmark
        C1["Competitors Page 'You' Row & Delete Binding"]
    end

    MW --> Track 1 & Track 2 & Track 3
    T4 & R2 & R3 & C1 --> V["Automated Regression Verification Suite (scripts/test-stage2.ts)"]
    V --> BG["Production Build & Typecheck (npm run build)"]
```

---

## 16. Workstreams

- **Workstream 1 (Security & Routing):** Update `src/middleware.ts` with complete public route exemptions for authentication, invites, webhooks, and cron jobs.
- **Workstream 2 (Team Management API & UI):** Build member listing and deletion APIs, connect `src/app/settings/page.tsx` to live backend data.
- **Workstream 3 (Reports API, UI & Cron):** Implement report deletion endpoint, wire `src/app/reports/page.tsx` to live database, create `src/app/api/cron/reports/route.ts` dispatch engine.
- **Workstream 4 (Competitor UI):** Connect `src/app/competitors/page.tsx` to dynamic business metrics and deletion API.
- **Workstream 5 (Verification & Release Gate):** Expand `scripts/test-stage2.ts`, verify full test pass, execute clean production build.

---

## 17. Execution Order (Sequential Steps)

1. **Step 1:** Update `src/middleware.ts` to exempt `/forgot-password`, `/reset-password`, `/invite/accept`, `/api/auth/forgot-password`, `/api/auth/reset-password`, `/api/team/invite/verify`, `/api/team/invite/accept`, `/api/webhooks/stripe`, `/api/cron/downgrade-trials`, `/api/cron/reports`.
2. **Step 2:** Create `src/app/api/team/members/route.ts` (`GET`), `src/app/api/team/invite/[id]/route.ts` (`DELETE`), and `src/app/api/team/members/[id]/route.ts` (`DELETE`).
3. **Step 3:** Create `src/app/api/reports/[id]/route.ts` (`DELETE`).
4. **Step 4:** Create `src/app/api/cron/reports/route.ts` (`GET`) for automated report digest dispatching.
5. **Step 5:** Refactor `src/app/settings/page.tsx` Team tab to fetch and display live members and pending invites from `/api/team/members`, with revoke and remove buttons.
6. **Step 6:** Refactor `src/app/reports/page.tsx` to fetch and render live scheduled reports from `/api/reports`, with pause/resume and delete actions.
7. **Step 7:** Refactor `src/app/competitors/page.tsx` to bind the "You" row to dynamic business data and wire competitor deletion.
8. **Step 8:** Update `scripts/test-stage2.ts` and `scripts/test-e2e-journeys.ts` with comprehensive Milestone 2B verification test cases.
9. **Step 9:** Execute full verification (`tsc`, `prisma validate`, `test-stage1`, `test-e2e-journeys`, `test-stage2`, `npm run build`).

---

## 18. Risk Register

| Risk ID | Description | Severity | Likelihood | Mitigation Strategy |
|---|---|---|---|---|
| **RSK-001** | Unauthenticated middleware bypass exposing protected routes | High | Low | Explicitly test that private routes (`/dashboard`, `/settings`, `/api/reviews`) still enforce session auth. |
| **RSK-002** | Accidental deletion of organization owner | High | Low | Hardcode fail-safe in `DELETE /api/team/members/[id]` rejecting any deletion of `Role.OWNER`. |
| **RSK-003** | Cron job timeout when processing large number of reports | Medium | Low | Process reports in sequential chunks with error try-catch per report; log failures without halting the batch. |
| **RSK-004** | Cross-tenant invitation revocation | High | Low | Always query `TeamInvitation` with `orgId: ctx.orgId` in where clause. |

---

## 19. Blocker Register

| Blocker ID | Severity | Description | Evidence | Impact | Resolution in 2B | Dependency |
|---|---|---|---|---|---|---|
| **BLK-001** | **P0** | Middleware blocks unauthenticated invite acceptance and password reset | `src/middleware.ts` lines 6–35 | Users cannot accept invites or reset passwords | Add routes to `PUBLIC_ROUTES` / `PUBLIC_API_ROUTES` | None |
| **BLK-002** | **P1** | Settings page displays fake team members | `src/app/settings/page.tsx` line 441 | Cannot manage real team members | Build `GET /api/team/members` & bind UI | None |
| **BLK-003** | **P1** | Reports page displays fake reports | `src/app/reports/page.tsx` line 67 | Cannot view or manage scheduled reports | Bind UI to `GET /api/reports` & delete API | None |
| **BLK-004** | **P1** | Scheduled reports are never dispatched | No cron runner exists | Automated report feature does not operate | Build `src/app/api/cron/reports/route.ts` | None |

---

## 20. Definition of Done (Milestone 2B)

- [ ] All public authentication, invite, webhook, and cron routes are explicitly exempt in `src/middleware.ts`.
- [ ] `GET /api/team/members`, `DELETE /api/team/invite/[id]`, and `DELETE /api/team/members/[id]` are implemented with strict RBAC and tenant isolation.
- [ ] `src/app/settings/page.tsx` Team tab renders live active members and pending invitations with functioning invite, revoke, and remove actions.
- [ ] `src/app/reports/page.tsx` renders live scheduled reports from database with working create, edit, pause/resume, and delete operations.
- [ ] `src/app/api/cron/reports/route.ts` executes report digests and dispatches via Resend with Bearer authentication.
- [ ] `src/app/competitors/page.tsx` displays real business metrics and supports live competitor deletion.
- [ ] Automated test suite passes 100% across Stage 1, Stage 2, and E2E journeys without regression.
- [ ] Production build (`npm run build`) succeeds cleanly with zero type errors or broken routes.
- [ ] Working tree remains clean and fully verified.

---

## 21. Exit Gate

The CTO Milestone 2B Exit Gate is **GREEN** if and only if:
1. `npx tsc --noEmit` exits with 0 errors.
2. `npx prisma validate` passes with 0 schema errors.
3. `npx tsx scripts/test-stage1.ts` passes 30/30 tests.
4. `npx tsx scripts/test-e2e-journeys.ts` passes 17/17 journeys.
5. `npx tsx scripts/test-stage2.ts` passes all Stage 2 tests (including 2B additions).
6. `npm run build` generates all application routes cleanly.
7. Manual simulation confirms zero UI dead-ends in Reports, Team Settings, and Invite Acceptance.

---

## 22. Rollback Plan

If any critical regression occurs during Milestone 2B execution:
1. Revert working tree to baseline commit `bef6d6814853624403f3dcd21e294481af3e96a2`.
2. Clean Next.js build cache (`rm -rf .next`).
3. Re-run `npx prisma generate` to ensure client state matches schema.
4. Execute `npm run build` and `scripts/test-stage2.ts` to restore verified Milestone 2A baseline.

---
*STAGE 2 MILESTONE 2B MASTER EXECUTION PLAN CREATED — READY FOR CTO REVIEW.*
