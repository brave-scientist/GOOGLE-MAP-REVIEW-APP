/**
 * app/vs/podium/page.tsx — comparison landing page (vs Podium).
 */

export const metadata = { title: "ReviewReply-Lite vs Podium — review replies without the inbox" };

export default function VsPodiumPage() {
  return (
    <div className="min-h-screen bg-ink px-6 py-16">
      <div className="mx-auto max-w-3xl">
        <div className="mb-3 font-mono text-xs uppercase tracking-widest text-brass-light">ReviewReply-Lite vs Podium</div>
        <h1 className="mb-6 font-display text-4xl font-bold text-cream">
          Just reviews. No inbox, no webchat, no $400/mo.
        </h1>

        <section className="mb-10 rounded-xl border border-cream/10 bg-ink-2 p-6">
          <h2 className="mb-3 font-display text-xl font-semibold text-cream">What Podium does well</h2>
          <p className="text-cream-dim">Podium is a full customer-communication platform — webchat, payments, team inboxes, and review management in one tool. For businesses that want to consolidate all customer interactions into a single inbox, Podium is powerful.</p>
        </section>

        <section className="mb-10 rounded-xl border border-cream/10 bg-ink-2 p-6">
          <h2 className="mb-3 font-display text-xl font-semibold text-cream">Who ReviewReply-Lite is built for</h2>
          <p className="text-cream-dim">Businesses that just want their reviews handled — AI-drafted replies, review requests by text — without paying for an inbox they won't use. ReviewReply-Lite does one thing well, costs $29-$59/mo instead of $400+, and requires no contract or sales call.</p>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 font-display text-xl font-semibold text-cream">Direct comparison</h2>
          <div className="overflow-hidden rounded-xl border border-cream/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-ink-2 text-cream-dim">
                <tr>
                  <th className="px-4 py-3 font-medium">Feature</th>
                  <th className="px-4 py-3 font-medium">ReviewReply-Lite</th>
                  <th className="px-4 py-3 font-medium">Podium</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream/5 text-cream-dim">
                <tr><td className="px-4 py-3">Starting price</td><td className="px-4 py-3 text-brass-light">$29/mo</td><td className="px-4 py-3">$400+/mo</td></tr>
                <tr><td className="px-4 py-3">Contract required</td><td className="px-4 py-3 text-brass-light">No</td><td className="px-4 py-3">Yes</td></tr>
                <tr><td className="px-4 py-3">AI review replies</td><td className="px-4 py-3 text-brass-light">✓ Included</td><td className="px-4 py-3">Limited</td></tr>
                <tr><td className="px-4 py-3">Webchat / inbox</td><td className="px-4 py-3">Not included</td><td className="px-4 py-3">✓</td></tr>
                <tr><td className="px-4 py-3">Payment processing</td><td className="px-4 py-3">Not included</td><td className="px-4 py-3">✓</td></tr>
                <tr><td className="px-4 py-3">Setup time</td><td className="px-4 py-3 text-brass-light">~10 min</td><td className="px-4 py-3">Days (onboarding)</td></tr>
                <tr><td className="px-4 py-3">Best for</td><td className="px-4 py-3 text-brass-light">Reviews only</td><td className="px-4 py-3">Full comms suite</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <a href="/#pricing" className="inline-block rounded-lg bg-brass px-7 py-3.5 text-base font-semibold text-ink transition hover:brightness-110">Start your free trial →</a>
      </div>
    </div>
  );
}