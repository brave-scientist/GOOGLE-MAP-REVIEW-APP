/**
 * app/(marketing)/privacy/page.tsx — Privacy Policy (placeholder).
 */

export const metadata = { title: "Privacy Policy — ReviewReply-Lite" };

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-ink px-6 py-16">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-2 font-display text-3xl font-bold text-cream">Privacy Policy</h1>
        <p className="mb-8 rounded-lg border border-coral/40 bg-coral/10 px-4 py-3 text-sm text-coral">
          This is placeholder legal text for the mock-mode demo. It must be reviewed and replaced
          by a qualified attorney before commercial launch.
        </p>
        <div className="space-y-4 text-cream-dim">
          <p>Last updated: August 1, 2026</p>
          <h2 className="font-display text-xl font-semibold text-cream">Data We Collect</h2>
          <p>Business owner email and name (for account identity), Google/Facebook OAuth tokens (encrypted at rest), end-customer names and contact info (for review requests), review text and ratings (from Google/Facebook APIs), and AI-drafted/posted reply text.</p>
          <h2 className="font-display text-xl font-semibold text-cream">How We Use Data</h2>
          <p>Customer contact data is used only to send review requests on behalf of the business owner. It is never exported to analytics tools or logged in plaintext.</p>
          <h2 className="font-display text-xl font-semibold text-cream">Data Retention</h2>
          <p>End-customer contact data is deleted within 30 days of subscription cancellation. Review data from public platforms may be retained longer. OAuth tokens are revoked and deleted immediately on cancellation.</p>
          <h2 className="font-display text-xl font-semibold text-cream">Data Security</h2>
          <p>OAuth tokens are encrypted at rest. No PII is logged in error messages or analytics events. Database backups follow the same encryption standards as live data.</p>
          <h2 className="font-display text-xl font-semibold text-cream">Third-Party Services</h2>
          <p>We use Supabase (database/auth), Inngest (background jobs), Stripe (payments), Twilio (SMS), Resend (email), and Anthropic (AI). Each has their own privacy policy.</p>
          <h2 className="font-display text-xl font-semibold text-cream">Contact</h2>
          <p>For privacy questions, contact support@reviewreply.app.</p>
        </div>
        <div className="mt-8"><a href="/" className="text-sm text-brass-light hover:underline">← Back to home</a></div>
      </div>
    </div>
  );
}