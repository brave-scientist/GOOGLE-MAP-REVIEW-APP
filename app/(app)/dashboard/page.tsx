/**
 * app/(app)/dashboard/page.tsx — main dashboard.
 *
 * Week 2 scope: dashboard shell with key stats for the active business
 * (reviews needing a reply, requests sent / clicked this month). The quick-add
 * form and full review/request UIs land in Weeks 3-5.
 */

import { getCurrentUser } from "@/lib/auth";
import { getStore } from "@/lib/db";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const store = await getStore();
  const businesses = await store.getBusinessesForUser(user!.id);
  const business = businesses[0]!;

  const reviews = await store.listReviews(business.id);
  const requests = await store.listReviewRequests(business.id);
  const sub = await store.getSubscription(business.id);

  const needsReply = reviews.filter(
    (r) => r.status === "new" || r.status === "draft_generated"
  ).length;
  const replied = reviews.filter((r) => r.status === "replied").length;
  const sentRequests = requests.filter((r) => r.status === "sent" || r.status === "clicked").length;
  const clickedRequests = requests.filter((r) => r.status === "clicked").length;

  const stats = [
    { label: "Reviews needing a reply", value: needsReply, accent: needsReply > 0 },
    { label: "Replies posted", value: replied, accent: false },
    { label: "Requests sent (this month)", value: sentRequests, accent: false },
    { label: "Requests clicked", value: clickedRequests, accent: false },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-cream">{business.name}</h1>
        <p className="mt-1 text-sm text-cream-dim">
          {business.google_business_profile_account_id ? "✓ Google connected" : "Google not connected"}
          {" · "}
          {business.facebook_page_id ? "✓ Facebook connected" : "Facebook not connected"}
          {sub && ` · ${sub.plan} plan · ${sub.status}`}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className={`rounded-xl border p-5 ${
              s.accent
                ? "border-coral/40 bg-coral/5"
                : "border-cream/10 bg-ink-2"
            }`}
          >
            <div className="font-mono text-3xl font-semibold text-cream">{s.value}</div>
            <div className="mt-1 text-sm text-cream-dim">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-cream/10 bg-ink-2 p-5">
          <h2 className="mb-3 font-display text-lg font-semibold text-cream">
            Recent reviews
          </h2>
          {reviews.length === 0 ? (
            <p className="text-sm text-cream-dim">
              No reviews yet. New ones will appear here once the poll job runs.
            </p>
          ) : (
            <ul className="space-y-3">
              {reviews.slice(0, 5).map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-cream">
                        {r.reviewer_name}
                      </span>
                      <span className="text-xs text-coral">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                    </div>
                    <p className="truncate text-sm text-cream-dim">
                      {r.review_text ?? "No text"}
                    </p>
                  </div>
                  <span className="shrink-0 rounded bg-ink-3 px-2 py-0.5 text-xs text-cream-dim">
                    {r.source}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <a href="/reviews" className="mt-4 block text-sm text-brass-light hover:underline">
            View all reviews →
          </a>
        </div>

        <div className="rounded-xl border border-cream/10 bg-ink-2 p-5">
          <h2 className="mb-3 font-display text-lg font-semibold text-cream">
            Recent review requests
          </h2>
          {requests.length === 0 ? (
            <p className="text-sm text-cream-dim">
              No requests sent yet. Add a customer to get started.
            </p>
          ) : (
            <ul className="space-y-3">
              {requests.slice(0, 5).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-cream">{r.customer_name}</div>
                    <div className="text-xs capitalize text-cream-dim">
                      via {r.entry_method.replace("_", " ")}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded px-2 py-0.5 text-xs ${
                      r.status === "clicked"
                        ? "bg-green-500/15 text-green-400"
                        : r.status === "sent"
                          ? "bg-brass/15 text-brass-light"
                          : r.status === "failed"
                            ? "bg-coral/15 text-coral"
                            : "bg-ink-3 text-cream-dim"
                    }`}
                  >
                    {r.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <a href="/requests" className="mt-4 block text-sm text-brass-light hover:underline">
            Manage requests →
          </a>
        </div>
      </div>
    </div>
  );
}