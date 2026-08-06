/**
 * app/(app)/org-dashboard/page.tsx — Parent Organization / Multi-location Dashboard.
 *
 * Exclusively for enterprise tier users with multiple business locations.
 * Aggregates KPIs (average rating, review response rate, total requests sent)
 * across all connected locations, and renders a performance leaderboard.
 */

import { getCurrentUser } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function OrgDashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const store = await getStore();
  const businesses = await store.getBusinessesForUser(user.id);

  if (!businesses || businesses.length === 0) {
    redirect("/onboarding");
  }

  // Aggregate stats across all locations
  let totalReviews = 0;
  let totalReplied = 0;
  let totalRatingSum = 0;
  let ratingCount = 0;
  let totalRequestsThisMonth = 0;

  const locationDetails = [];

  for (const b of businesses) {
    const reviews = await store.listReviews(b.id);
    const requests = await store.listReviewRequests(b.id);

    const bNeedsReply = reviews.filter(
      (r) => r.status === "new" || r.status === "draft_generated"
    ).length;
    const bReplied = reviews.filter((r) => r.status === "replied").length;
    const bRequestsThisMonth = await store.countRequestsThisMonth(b.id);

    totalReviews += reviews.length;
    totalReplied += bReplied;
    totalRequestsThisMonth += bRequestsThisMonth;

    let bRatingSum = 0;
    for (const r of reviews) {
      bRatingSum += r.rating;
      totalRatingSum += r.rating;
      ratingCount++;
    }

    const bAvgRating = reviews.length > 0 ? (bRatingSum / reviews.length).toFixed(1) : "—";
    const bResponseRate = reviews.length > 0 ? Math.round((bReplied / reviews.length) * 100) : 100;

    locationDetails.push({
      id: b.id,
      name: b.name,
      category: b.category,
      reviewsCount: reviews.length,
      avgRating: bAvgRating,
      responseRate: bResponseRate,
      needsReply: bNeedsReply,
    });
  }

  const avgRating = ratingCount > 0 ? (totalRatingSum / ratingCount).toFixed(1) : "—";
  const overallResponseRate = totalReviews > 0 ? Math.round((totalReplied / totalReviews) * 100) : 100;

  // Sort locations by response rate descending for the leaderboard
  locationDetails.sort((a, b) => b.responseRate - a.responseRate);

  const stats = [
    { label: "Total connected locations", value: businesses.length, accent: false },
    { label: "Global average rating", value: `★ ${avgRating}`, accent: false },
    { label: "Global response rate", value: `${overallResponseRate}%`, accent: false },
    { label: "Global requests (this month)", value: totalRequestsThisMonth, accent: false },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-cream">Organization Performance</h1>
        <p className="mt-1 text-sm text-cream-dim">
          Aggregate reputation and acquisition overview across all your connected locations.
        </p>
      </div>

      {/* Aggregate Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-cream/10 bg-ink-2 p-5">
            <div className="font-mono text-3xl font-semibold text-cream">{s.value}</div>
            <div className="mt-1 text-sm text-cream-dim">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Location Leaderboard */}
      <div className="rounded-xl border border-cream/10 bg-ink-2 p-6">
        <h2 className="mb-4 font-display text-lg font-semibold text-cream">Location Leaderboard</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm text-cream">
            <thead>
              <tr className="border-b border-cream/10 text-xs font-mono uppercase tracking-wider text-cream-dim">
                <th className="pb-3 pr-4">Location Name</th>
                <th className="pb-3 px-4">Category</th>
                <th className="pb-3 px-4 text-center">Reviews</th>
                <th className="pb-3 px-4 text-center">Avg Rating</th>
                <th className="pb-3 px-4 text-center">Response Rate</th>
                <th className="pb-3 pl-4 text-right">Needs Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream/5">
              {locationDetails.map((loc, idx) => (
                <tr key={loc.id} className="group hover:bg-cream/5">
                  <td className="py-4 pr-4 font-medium text-cream">{loc.name}</td>
                  <td className="py-4 px-4 capitalize text-cream-dim">{loc.category}</td>
                  <td className="py-4 px-4 text-center font-mono text-cream-dim">{loc.reviewsCount}</td>
                  <td className="py-4 px-4 text-center font-mono text-coral">{loc.avgRating}</td>
                  <td className="py-4 px-4 text-center">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-mono font-medium ${
                        loc.responseRate >= 80
                          ? "bg-green-500/10 text-green-400"
                          : loc.responseRate >= 50
                            ? "bg-brass/10 text-brass-light"
                            : "bg-coral/10 text-coral"
                      }`}
                    >
                      {loc.responseRate}%
                    </span>
                  </td>
                  <td className="py-4 pl-4 text-right">
                    {loc.needsReply > 0 ? (
                      <span className="rounded bg-coral/15 px-2 py-0.5 font-mono text-xs text-coral">
                        {loc.needsReply} pending
                      </span>
                    ) : (
                      <span className="text-green-400">✓ Caught up</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
