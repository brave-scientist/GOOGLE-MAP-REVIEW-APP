import { LegalLayout } from '@/components/app/marketing-shell'
import { SITE_CONFIG } from '@/lib/site-config'

export const metadata = {
  title: 'Privacy Policy — ReviewReply Enterprise',
  description: 'How ReviewReply Enterprise collects, uses, and protects your data.',
}

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" lastUpdated="August 1, 2026">
      <section>
        <h2 className="text-xl font-bold text-foreground mb-3">1. Overview</h2>
        <p>
          ReviewReply Enterprise (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) operates a review management platform that helps businesses aggregate, respond to, and analyze customer reviews across multiple platforms. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our website and services.
        </p>
        <p className="mt-3">
          We are committed to protecting your privacy and complying with the General Data Protection Regulation (GDPR), the California Consumer Privacy Act (CCPA), and other applicable data protection laws. By using our services, you consent to the practices described in this policy.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-foreground mb-3">2. Information We Collect</h2>
        <h3 className="text-base font-semibold text-foreground mb-2">2.1 Information You Provide</h3>
        <ul className="list-disc pl-6 space-y-1">
          <li><strong>Account information:</strong> Name, email address, password (hashed), and business details when you sign up.</li>
          <li><strong>Business profile:</strong> Business name, address, phone number, industry, timezone, and integration credentials (OAuth tokens stored encrypted).</li>
          <li><strong>Customer data:</strong> When you send review requests, we process customer names and contact information (phone, email) to deliver SMS/email on your behalf.</li>
          <li><strong>Communication:</strong> Any emails, support tickets, or feedback you send us.</li>
        </ul>
        <h3 className="text-base font-semibold text-foreground mb-2 mt-4">2.2 Information We Collect Automatically</h3>
        <ul className="list-disc pl-6 space-y-1">
          <li><strong>Usage data:</strong> IP address, browser type, device information, pages visited, time spent, and click patterns.</li>
          <li><strong>Review data:</strong> Reviews fetched from connected platforms (Google Business Profile, Facebook Pages) on your behalf.</li>
          <li><strong>Cookies and similar technologies:</strong> Session cookies for authentication, analytics cookies for product improvement.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-bold text-foreground mb-3">3. How We Use Your Information</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li><strong>Service delivery:</strong> To provide the review management platform, including fetching reviews, generating AI draft replies, sending review requests, and displaying analytics.</li>
          <li><strong>Authentication:</strong> To verify your identity and manage your account session.</li>
          <li><strong>Communication:</strong> To send you service-related notifications (e.g., new reviews, trial expiration), product updates, and support responses.</li>
          <li><strong>Improvement:</strong> To analyze usage patterns, improve our features, develop new functionality, and troubleshoot issues.</li>
          <li><strong>Security:</strong> To detect and prevent fraud, abuse, and unauthorized access to our platform.</li>
          <li><strong>Compliance:</strong> To comply with legal obligations and protect our legal rights.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-bold text-foreground mb-3">4. Legal Basis for Processing (GDPR)</h2>
        <p>We process your personal data under the following legal bases:</p>
        <ul className="list-disc pl-6 space-y-1 mt-2">
          <li><strong>Contractual necessity:</strong> To provide the services you requested under our Terms of Service.</li>
          <li><strong>Legitimate interests:</strong> To improve our services, ensure security, and prevent fraud, balanced against your privacy rights.</li>
          <li><strong>Consent:</strong> For non-essential cookies, marketing communications, and certain data processing activities.</li>
          <li><strong>Legal obligation:</strong> To comply with applicable laws, such as tax records and audit requirements.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-bold text-foreground mb-3">5. Data Sharing and Disclosure</h2>
        <p>We do not sell your personal data. We share information with the following categories of recipients:</p>
        <ul className="list-disc pl-6 space-y-1 mt-2">
          <li><strong>Service providers:</strong> Sub-processors who help us deliver the service (hosting, email delivery, SMS, payments, analytics). A full list is available in our Sub-processor Register.</li>
          <li><strong>Review platforms:</strong> Google Business Profile and Facebook Pages when you connect your accounts via OAuth and we fetch or post reviews on your behalf.</li>
          <li><strong>Legal authorities:</strong> When required by law, court order, or to protect our rights, property, or safety.</li>
          <li><strong>Business transfers:</strong> In connection with a merger, acquisition, or asset sale, with notice to you.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-bold text-foreground mb-3">6. Data Retention</h2>
        <p>We retain your data for the following periods:</p>
        <ul className="list-disc pl-6 space-y-1 mt-2">
          <li><strong>Account data:</strong> Until you delete your account, after which we retain data for 30 days for recovery, then permanently delete it.</li>
          <li><strong>Customer contact info (PII):</strong> 90 days after the last review request, then automatically purged.</li>
          <li><strong>Reviews and replies:</strong> Until account deletion.</li>
          <li><strong>Audit logs:</strong> 7 years for SOC2 and legal compliance.</li>
          <li><strong>AI draft history:</strong> 1 year for brand voice training and quality improvement.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-bold text-foreground mb-3">7. Your Rights</h2>
        <p>Under GDPR and CCPA, you have the following rights:</p>
        <ul className="list-disc pl-6 space-y-1 mt-2">
          <li><strong>Access:</strong> Request a copy of your personal data.</li>
          <li><strong>Rectification:</strong> Correct inaccurate or incomplete data.</li>
          <li><strong>Erasure:</strong> Request deletion of your personal data (&quot;right to be forgotten&quot;).</li>
          <li><strong>Restriction:</strong> Limit our processing of your data in certain circumstances.</li>
          <li><strong>Portability:</strong> Receive your data in a machine-readable format.</li>
          <li><strong>Objection:</strong> Object to processing based on legitimate interests.</li>
          <li><strong>Withdraw consent:</strong> Withdraw consent for consent-based processing at any time.</li>
        </ul>
        <p className="mt-3">To exercise these rights, visit Settings → Compliance → GDPR, or email <a href={`mailto:${SITE_CONFIG.supportEmail}`} className="text-[var(--brass)] hover:underline">{SITE_CONFIG.supportEmail}</a>. We respond within 30 days.</p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-foreground mb-3">8. Data Security</h2>
        <p>We implement industry-standard security measures to protect your data:</p>
        <ul className="list-disc pl-6 space-y-1 mt-2">
          <li>AES-256-GCM encryption for PII at rest, with KMS-managed keys.</li>
          <li>TLS 1.3 for data in transit.</li>
          <li>Row-Level Security (RLS) in our database for tenant isolation.</li>
          <li>OAuth 2.0 for third-party integrations — we never store passwords.</li>
          <li>SOC2 Type II controls (audit in progress).</li>
          <li>Regular penetration testing and security reviews.</li>
          <li>Audit logging of all write operations, retained 7 years.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-bold text-foreground mb-3">9. International Data Transfers</h2>
        <p>
          Your data may be processed in the United States (default) or the European Union (for Enterprise customers who request EU data residency). We use Standard Contractual Clauses (SCCs) for international transfers and have implemented supplementary measures to ensure an adequate level of protection.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-foreground mb-3">10. Cookies</h2>
        <p>We use the following categories of cookies:</p>
        <ul className="list-disc pl-6 space-y-1 mt-2">
          <li><strong>Essential:</strong> Required for the site to function (authentication, security).</li>
          <li><strong>Analytics:</strong> Help us understand how the product is used (anonymized).</li>
          <li><strong>Marketing:</strong> Used for retargeting (opt-in only).</li>
        </ul>
        <p className="mt-3">You can manage cookie preferences via the consent banner or in Settings → Compliance → GDPR.</p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-foreground mb-3">11. Children&apos;s Privacy</h2>
        <p>Our services are not directed to children under 16, and we do not knowingly collect personal data from children. If you believe we have collected data from a child, please contact us immediately.</p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-foreground mb-3">12. Changes to This Policy</h2>
        <p>We may update this Privacy Policy from time to time. We will notify you of material changes via email and post a notice in the app 30 days before the changes take effect. The &quot;Last updated&quot; date at the top reflects the most recent revision.</p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-foreground mb-3">13. Contact Us</h2>
        <p>If you have questions about this Privacy Policy or our data practices, please contact:</p>
        <ul className="list-none pl-0 mt-2 space-y-1">
          <li><strong>Data Protection Officer:</strong> <a href={`mailto:${SITE_CONFIG.supportEmail}`} className="text-[var(--brass)] hover:underline">{SITE_CONFIG.supportEmail}</a></li>
          <li><strong>General inquiries:</strong> <a href={`mailto:${SITE_CONFIG.supportEmail}`} className="text-[var(--brass)] hover:underline">{SITE_CONFIG.supportEmail}</a></li>
          <li><strong>Postal address:</strong> ReviewReply Enterprise, Attn: Privacy, {SITE_CONFIG.address.full}</li>
        </ul>
      </section>
    </LegalLayout>
  )
}
