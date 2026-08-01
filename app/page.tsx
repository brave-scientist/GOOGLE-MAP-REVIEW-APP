/**
 * app/page.tsx — temporary Week-1 home page.
 *
 * The FULL marketing landing page (faithful port of landing-page.html) is built
 * in Week 7-8 at app/(marketing)/page.tsx. Until then this root page is a
 * minimal "scaffold is live" notice so `pnpm dev` shows something and links to
 * the Inngest + dev-trigger endpoints for verification.
 */

import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-ink text-cream">
      <div className="awning" />
      <div className="mx-auto max-w-2xl px-6 py-20">
        <div className="mb-3 font-mono text-xs uppercase tracking-widest text-brass-light">
          ● Scaffold live
        </div>
        <h1 className="font-display text-4xl font-bold leading-tight">
          ReviewReply-Lite
          <span className="text-brass-light"> — mock-mode build</span>
        </h1>
        <p className="mt-4 text-cream-dim">
          Week 1 scaffolding is up. The full marketing landing page, onboarding,
          dashboard, reviews, requests, and billing flows are being built in the
          following weeks. This page is a temporary placeholder.
        </p>

        <div className="mt-8 rounded-xl border border-cream/10 bg-ink-2 p-5 font-mono text-sm">
          <div className="mb-2 text-brass-light">Quick verification links</div>
          <ul className="space-y-1 text-cream-dim">
            <li>
              <Link className="underline hover:text-cream" href="/api/inngest">
                /api/inngest
              </Link>{" "}
              — Inngest endpoint (function registry)
            </li>
            <li>
              <span className="text-cream-dim">
                POST /api/dev/trigger?job=poll-reviews
              </span>{" "}
              — manually trigger the review poll job
            </li>
            <li>
              <span className="text-cream-dim">pnpm seed</span> — (re)seed demo data
            </li>
          </ul>
        </div>

        <p className="mt-6 text-xs text-cream-dim">
          Run <code className="font-mono text-brass-light">pnpm seed</code> first
          to populate the local store, then explore the app routes as they land.
        </p>
      </div>
    </main>
  );
}