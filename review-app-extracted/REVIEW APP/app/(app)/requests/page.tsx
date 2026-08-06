/**
 * app/(app)/requests/page.tsx — review request management page.
 *
 * Phase 3: hosts the RequestsManager client component (quick-add primary,
 * paste-list secondary, CSV tertiary per the locked priority in
 * Product-Roadmap.md Phase 3). Loads the business's existing review_requests
 * server-side and passes them as initial state.
 */

import { getCurrentUser, getActiveBusiness } from "@/lib/auth";
import { getStore } from "@/lib/db";
import RequestsManager from "@/components/RequestsManager";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function RequestsPage() {
  const user = await getCurrentUser();
  const store = await getStore();
  const business = await getActiveBusiness();

  if (!business) {
    redirect("/onboarding");
  }
  const requests = await store.listReviewRequests(business.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-cream">
          Review Requests
        </h1>
        <p className="mt-1 text-sm text-cream-dim">
          Ask customers for a review via SMS or email. Quick-add one at a time,
          paste a list, or upload a CSV.
        </p>
      </div>

      <RequestsManager business={business} initialRequests={requests} />
    </div>
  );
}
