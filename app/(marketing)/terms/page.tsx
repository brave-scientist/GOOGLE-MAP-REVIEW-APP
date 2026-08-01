/**
 * app/(marketing)/terms/page.tsx — Terms of Service (placeholder).
 *
 * This is clearly-labeled placeholder legal text. Per Implementation-Plan Week 7-8:
 * "have these reviewed before commercial launch — this is a genuine legal document."
 */

export const metadata = { title: "Terms of Service — ReviewReply-Lite" };

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-ink px-6 py-16">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-2 font-display text-3xl font-bold text-cream">Terms of Service</h1>
        <p className="mb-8 rounded-lg border border-coral/40 bg-coral/10 px-4 py-3 text-sm text-coral">
          This is placeholder legal text for the mock-mode demo. It must be reviewed and replaced
          by a qualified attorney before commercial launch.
        </p>
        <div className="prose prose-invert max-w-none space-y-4 text-cream-dim">
          <p>Last updated: August 1, 2026</p>
          <h2 className="font-display text-xl font-semibold text-cream">1. Acceptance of Terms</h2>
          <p>By using ReviewReply-Lite, you agree to these terms. If you do not agree, do not use the service.</p>
          <h2 className="font-display text-xl font-semibold text-cream">2. Service Description</h2>
          <p>ReviewReply-Lite is a tool that helps single-location businesses reply to Google and Facebook reviews and request reviews from their customers.</p>
          <h2 className="font-display text-xl font-semibold text-cream">3. Pricing and Billing</h2>
          <p>Starter plan is $29/month, Pro plan is $59/month. A 14-day free trial is available with a credit card on file. Overage charges of $0.05 per review request beyond your plan limit apply.</p>
          <h2 className="font-display text-xl font-semibold text-cream">4. Data and Privacy</h2>
          <p>We handle your data as described in our Privacy Policy. Customer contact data is deleted within 30 days of subscription cancellation.</p>
          <h2 className="font-display text-xl font-semibold text-cream">5. Cancellation</h2>
          <p>You can cancel your subscription at any time from your billing settings. No support ticket or phone call is required.</p>
          <h2 className="font-display text-xl font-semibold text-cream">6. Limitation of Liability</h2>
          <p>[To be drafted by legal counsel.]</p>
          <h2 className="font-display text-xl font-semibold text-cream">7. Contact</h2>
          <p>For questions about these terms, contact support@reviewreply.app.</p>
        </div>
        <div className="mt-8">
          <a href="/" className="text-sm text-brass-light hover:underline">← Back to home</a>
        </div>
      </div>
    </div>
  );
}