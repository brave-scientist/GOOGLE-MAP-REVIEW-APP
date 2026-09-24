import { LegalLayout } from '@/components/app/marketing-shell'
import { SITE_CONFIG } from '@/lib/site-config'

export const metadata = {
  title: 'Terms of Service — ReviewReply Enterprise',
  description: 'The terms and conditions for using ReviewReply Enterprise.',
}

export default function TermsPage() {
  return (
    <LegalLayout title="Terms of Service" lastUpdated="August 1, 2026">
      <section>
        <h2 className="text-xl font-bold text-foreground mb-3">1. Acceptance of Terms</h2>
        <p>
          By accessing or using ReviewReply Enterprise (the &quot;Service&quot;), you agree to be bound by these Terms of Service (&quot;Terms&quot;). If you do not agree to these Terms, you may not access or use the Service. These Terms form a legally binding agreement between you and ReviewReply Enterprise (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;).
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-foreground mb-3">2. Eligibility</h2>
        <p>
          You must be at least 16 years old (or the age of majority in your jurisdiction) to use the Service. By using the Service, you represent and warrant that you have the legal capacity to enter into these Terms, and that you have the authority to bind any business or organization on whose behalf you act.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-foreground mb-3">3. Accounts</h2>
        <p>To use the Service, you must create an account. You agree to:</p>
        <ul className="list-disc pl-6 space-y-1 mt-2">
          <li>Provide accurate, current, and complete information during registration.</li>
          <li>Maintain the security of your password and account credentials.</li>
          <li>Promptly notify us of any unauthorized use or security breach.</li>
          <li>Be responsible for all activities that occur under your account.</li>
          <li>Not share your account credentials with others.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-bold text-foreground mb-3">4. Subscription and Billing</h2>
        <h3 className="text-base font-semibold text-foreground mb-2">4.1 Plans and Pricing</h3>
        <p>We offer the following subscription plans:</p>
        <ul className="list-disc pl-6 space-y-1 mt-2">
          <li><strong>Free:</strong> $0/month — limited features for solo operators.</li>
          <li><strong>Starter:</strong> $49/month — for single-location businesses.</li>
          <li><strong>Pro:</strong> $99/month — for multi-location and growing teams.</li>
          <li><strong>Enterprise:</strong> $299/month — for agencies and multi-location chains.</li>
          <li><strong>Custom:</strong> Quoted — for large enterprise deployments.</li>
        </ul>
        <h3 className="text-base font-semibold text-foreground mb-2 mt-4">4.2 Billing Cycle</h3>
        <p>
          Subscriptions are billed monthly or annually, depending on your selection. Annual plans receive a 20% discount. All fees are charged in USD via Stripe. Your subscription automatically renews at the end of each billing cycle unless you cancel before the renewal date.
        </p>
        <h3 className="text-base font-semibold text-foreground mb-2 mt-4">4.3 Free Trial</h3>
        <p>
          We offer a 14-day free trial of the Pro plan. No credit card is required to start the trial. At the end of the trial, your account will be downgraded to the Free plan unless you upgrade. Trial data is retained for 30 days after trial expiration.
        </p>
        <h3 className="text-base font-semibold text-foreground mb-2 mt-4">4.4 Cancellation and Refunds</h3>
        <p>
          You may cancel your subscription at any time via Settings → Billing. Cancellation takes effect at the end of the current billing period — you retain access until then. Annual plans are eligible for a pro-rated refund for unused months. We do not offer refunds for monthly plans beyond the current billing cycle.
        </p>
        <h3 className="text-base font-semibold text-foreground mb-2 mt-4">4.5 Metered Usage and Overage</h3>
        <p>
          SMS messages, AI draft generations, and certain other features are metered. Each plan includes a monthly quota. Usage exceeding the quota is billed at published overage rates ($0.035/SMS, $0.02/AI draft). Overage charges appear on your next invoice.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-foreground mb-3">5. Acceptable Use</h2>
        <p>You agree not to:</p>
        <ul className="list-disc pl-6 space-y-1 mt-2">
          <li>Use the Service for any unlawful purpose or in violation of any local, state, national, or international law.</li>
          <li>Send unsolicited SMS, email, or other communications (spam) via our platform.</li>
          <li>Violate TCPA, CAN-SPAM, GDPR, CCPA, or other applicable communication and privacy laws.</li>
          <li>Post fake reviews, astroturf, or engage in review manipulation.</li>
          <li>Attempt to access, tamper with, or use non-public areas of the Service.</li>
          <li>Reverse engineer, decompile, or disassemble any part of the Service.</li>
          <li>Interfere with or disrupt the Service or servers connected to the Service.</li>
          <li>Use the Service to transmit viruses, malware, or other malicious code.</li>
          <li>Resell or sublicense the Service without our written consent (except as permitted under Agency plans).</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-bold text-foreground mb-3">6. Intellectual Property</h2>
        <p>
          The Service, including its design, features, and underlying technology, is owned by ReviewReply Enterprise and protected by intellectual property laws. You retain all rights to the content you submit (business information, reply templates, customer data). We retain all rights to anonymized, aggregated data derived from your usage.
        </p>
        <p className="mt-2">
          Reviews fetched from third-party platforms (Google, Facebook, etc.) remain the property of those platforms and their respective authors. We display them under the terms of each platform&apos;s API.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-foreground mb-3">7. AI-Generated Content</h2>
        <p>
          The Service uses the ReviewReply AI Engine to generate draft replies to reviews. You are responsible for reviewing, editing, and approving all AI-generated content before it is posted. We are not liable for the content of AI-generated replies.
        </p>
        <p className="mt-2">
          AI draft quality depends on the quality of your brand voice training data and the review context. You should always review drafts for accuracy, tone, and appropriateness before posting.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-foreground mb-3">8. Third-Party Integrations</h2>
        <p>
          The Service integrates with Google Business Profile, Facebook Pages, Twilio, Telnyx, Resend, and Stripe. Your use of these third-party services is subject to their respective terms and privacy policies. We are not responsible for the actions or policies of third-party services.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-foreground mb-3">9. Service Availability</h2>
        <p>
          We strive to maintain 99.9% uptime (Enterprise) and 99.5% uptime (Pro) excluding scheduled maintenance. We are not liable for downtime caused by factors beyond our control, including third-party outages, natural disasters, or internet infrastructure failures. Service credits are available for Enterprise customers per our SLA.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-foreground mb-3">10. Disclaimers</h2>
        <p>
          THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED. WE DO NOT WARRANT THAT THE SERVICE WILL BE ERROR-FREE, UNINTERRUPTED, OR THAT REVIEW DATA FROM THIRD-PARTY PLATFORMS WILL BE ACCURATE OR COMPLETE.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-foreground mb-3">11. Limitation of Liability</h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL REVIEWREPLY ENTERPRISE BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, DATA, OR BUSINESS OPPORTUNITIES, ARISING OUT OF OR RELATED TO THE SERVICE. OUR TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNT YOU PAID US IN THE 12 MONTHS PRECEDING THE CLAIM.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-foreground mb-3">12. Indemnification</h2>
        <p>
          You agree to indemnify and hold harmless ReviewReply Enterprise, its officers, directors, employees, and agents from any claims, damages, losses, or expenses (including legal fees) arising from your use of the Service, your violation of these Terms, or your violation of any third-party rights.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-foreground mb-3">13. Termination</h2>
        <p>
          You may terminate your account at any time via Settings → Account → Delete Account. We may suspend or terminate your account if you violate these Terms or engage in conduct that we determine, in our sole discretion, to be harmful to the Service or other users. Upon termination, your data will be deleted within 30 days, except audit logs (retained 7 years) and data we are legally required to keep.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-foreground mb-3">14. Governing Law</h2>
        <p>
          These Terms are governed by the laws of the State of California, United States, without regard to conflict-of-law principles. Any disputes will be resolved in the courts located in San Francisco County, California.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-foreground mb-3">15. Changes to Terms</h2>
        <p>
          We may update these Terms from time to time. We will notify you of material changes via email and in-app notification 30 days before they take effect. Continued use of the Service after the effective date constitutes acceptance of the updated Terms.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-foreground mb-3">16. Contact</h2>
        <p>For questions about these Terms, contact:</p>
        <ul className="list-none pl-0 mt-2 space-y-1">
          <li><strong>Email:</strong> <a href={`mailto:${SITE_CONFIG.supportEmail}`} className="text-[var(--brass)] hover:underline">{SITE_CONFIG.supportEmail}</a></li>
          <li><strong>Address:</strong> ReviewReply Enterprise, Attn: Legal, {SITE_CONFIG.address.full}</li>
        </ul>
      </section>
    </LegalLayout>
  )
}
