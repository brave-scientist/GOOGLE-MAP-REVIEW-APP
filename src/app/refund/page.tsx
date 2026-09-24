import { LegalLayout } from '@/components/app/marketing-shell'
import { SITE_CONFIG } from '@/lib/site-config'

export const metadata = {
  title: 'Refund Policy — ReviewReply Enterprise',
  description: 'Our refund and cancellation policy.',
}

export default function RefundPage() {
  return (
    <LegalLayout title="Refund Policy" lastUpdated="August 7, 2026">
      <section>
        <h2 className="text-xl font-bold text-foreground mb-3">1. Overview</h2>
        <p>
          We want you to be satisfied with ReviewReply Enterprise. This Refund Policy explains when and how you can receive a refund for your subscription. By subscribing to our services, you agree to the terms outlined below.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-foreground mb-3">2. 14-Day Free Trial</h2>
        <p>
          We offer a 14-day free trial of our Pro plan. No credit card is required to start the trial. If you cancel during the trial period, you will not be charged. At the end of the trial, your account automatically downgrades to the Free plan unless you choose to upgrade.
        </p>
        <p className="mt-2">
          Since no payment is collected during the trial, no refund is necessary for trial cancellations.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-foreground mb-3">3. Monthly Subscriptions</h2>
        <p>
          For monthly subscriptions, you can cancel at any time. Cancellation takes effect at the end of the current billing period — you retain access to all paid features until then.
        </p>
        <p className="mt-2">
          <strong>Refund eligibility for monthly plans:</strong>
        </p>
        <ul className="list-disc pl-6 space-y-1 mt-2">
          <li>If you cancel within 3 days of a monthly charge and have not used the service meaningfully (no campaigns sent, no AI drafts generated), we will issue a full refund.</li>
          <li>If you cancel after 3 days of a monthly charge, the charge is non-refundable, but you retain access until the end of the billing period.</li>
          <li>To request a refund, email <a href={`mailto:${SITE_CONFIG.supportEmail}`} className="text-[var(--brass)] hover:underline">{SITE_CONFIG.supportEmail}</a> within 3 days of the charge.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-bold text-foreground mb-3">4. Annual Subscriptions</h2>
        <p>
          For annual subscriptions, you can cancel at any time. Cancellation takes effect at the end of the current billing period.
        </p>
        <p className="mt-2">
          <strong>Refund eligibility for annual plans:</strong>
        </p>
        <ul className="list-disc pl-6 space-y-1 mt-2">
          <li>If you cancel within 30 days of the initial annual charge, we will issue a full refund.</li>
          <li>If you cancel after 30 days, we will issue a pro-rated refund for the unused full months remaining on your subscription.</li>
          <li>To request a refund, email <a href={`mailto:${SITE_CONFIG.supportEmail}`} className="text-[var(--brass)] hover:underline">{SITE_CONFIG.supportEmail}</a>.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-bold text-foreground mb-3">5. Metered Usage (SMS, AI Drafts)</h2>
        <p>
          Charges for metered usage (SMS messages, AI draft generations beyond your plan quota) are non-refundable once the usage has occurred. If you believe you were charged in error, contact <a href={`mailto:${SITE_CONFIG.supportEmail}`} className="text-[var(--brass)] hover:underline">{SITE_CONFIG.supportEmail}</a> within 7 days of the charge.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-foreground mb-3">6. How to Cancel</h2>
        <p>
          You can cancel your subscription at any time via Settings → Billing → Manage Subscription, or by emailing <a href={`mailto:${SITE_CONFIG.supportEmail}`} className="text-[var(--brass)] hover:underline">{SITE_CONFIG.supportEmail}</a>.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-foreground mb-3">7. Account Deletion and Data</h2>
        <p>
          If you delete your account, all data is permanently removed within 30 days (except audit logs, retained 7 years for legal compliance). Account deletion does not automatically trigger a refund — please request a refund before deleting your account if applicable.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-foreground mb-3">8. Contact</h2>
        <p>For refund requests or questions, contact:</p>
        <ul className="list-none pl-0 mt-2 space-y-1">
          <li><strong>Email:</strong> <a href={`mailto:${SITE_CONFIG.supportEmail}`} className="text-[var(--brass)] hover:underline">{SITE_CONFIG.supportEmail}</a></li>
        </ul>
      </section>
    </LegalLayout>
  )
}
