/**
 * app/(app)/layout.tsx — authenticated app shell with top nav.
 *
 * Guards auth: redirects to /login if no session, or to /onboarding if the user
 * has no connected business yet. Renders the shared nav (Dashboard, Reviews,
 * Requests, Settings, Billing) + a business picker if the user owns >1 business.
 */

import { redirect } from "next/navigation";
import { getCurrentUser, getActiveBusiness } from "@/lib/auth";
import { getStore } from "@/lib/db";
import AppNav from "@/components/AppNav";

// All app pages are session-dependent — never statically prerender.
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const store = await getStore();
  const businesses = await store.getBusinessesForUser(user.id);

  // No business yet → onboarding.
  if (businesses.length === 0) redirect("/onboarding");

  const activeBusiness = await getActiveBusiness();

  return (
    <div className="min-h-screen bg-ink">
      <AppNav
        businesses={businesses}
        activeBusinessId={activeBusiness?.id ?? businesses[0]!.id}
        userEmail={user.email}
      />
      <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
    </div>
  );
}
