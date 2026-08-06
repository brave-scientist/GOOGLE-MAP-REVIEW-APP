/**
 * app/vs/birdeye/page.tsx — comparison landing page (vs Birdeye).
 */

export const metadata = { title: "ReviewReply-Lite vs Birdeye — simpler, cheaper, no contract" };

export default function VsBirdeyePage() {
  return (
    <div className="min-h-screen bg-ink px-6 py-16">
      <div className="mx-auto max-w-3xl">
        <div className="mb-3 font-mono text-xs uppercase tracking-widest text-brass-light">ReviewReply-Lite vs Birdeye</div>
        <h1 className="mb-6 font-display text-4xl font-bold text-cream">
          The review tool for businesses that don't need a 6-month contract.
        </h1>

        <section className="mb-10 rounded-xl border border-cream/10 bg-ink-2 p-6">
          <h2 className="mb-3 font-display text-xl font-semibold text-cream">What Birdeye does well</h2>
          <p className="text-cream-dim">Birdeye is a comprehensive reputation management platform for multi-location businesses and enterprises. It offers deep analytics, social media management, and survey tools. If you run 50+ locations and need a full marketing suite, Birdeye is a solid choice.</p>
        </section>

        <section className="mb-10 rounded-xl border border-cream/10 bg-ink-2 p-6">
          <h2 className="mb-3 font-display text-xl font-semibold text-cream">Who ReviewReply-Lite is built for</h2>
          <p className="text-cream-dim">Single-location businesses that want reviews handled — replies drafted automatically, review requests sent by text — without the overhead, contracts, or price tag of an enterprise platform. ReviewReply-Lite is self-serve, month-to-month, and starts at $29/mo with no setup call.</p>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 font-display text-xl font-semibold text-cream">Direct comparison</h2>
          <div className="overflow-hidden rounded-xl border border-cream/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-ink-2 text-cream-dim">
                <tr>
                  <th className="px-4 py-3 font-medium">Feature</th>
                  <th className="px-4 py-3 font-medium">ReviewReply-Lite</th>
                  <th className="px-4 py-3 font-medium">Birdeye</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream/5 text-cream-dim">
                <tr><td className="px-4 py-3">Starting price</td><td className="px-4 py-3 text-brass-light">$29/mo</td><td className="px-4 py-3">$300+/mo</td></tr>
                <tr><td className="px-4 py-3">Contract required</td><td className="px-4 py-3 text-brass-light">No — month-to-month</td><td className="px-4 py-3">Annual contract</td></tr>
                <tr><td className="px-4 py-3">Setup call needed</td><td className="px-4 py-3 text-brass-light">No — self-serve</td><td className="px-4 py-3">Yes — sales process</td></tr>
                <tr><td className="px-4 py-3">AI review replies</td><td className="px-4 py-3 text-brass-light">✓ Included</td><td className="px-4 py-3">Add-on</td></tr>
                <tr><td className="px-4 py-3">SMS review requests</td><td className="px-4 py-3 text-brass-light">✓ (Pro plan)</td><td className="px-4 py-3">✓</td></tr>
                <tr><td className="px-4 py-3">Best for</td><td className="px-4 py-3 text-brass-light">1 location</td><td className="px-4 py-3">10+ locations</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <a href="/#pricing" className="inline-block rounded-lg bg-brass px-7 py-3.5 text-base font-semibold text-ink transition hover:brightness-110">Start your free trial →</a>
      </div>
    </div>
  );
}