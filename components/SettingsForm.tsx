"use client";

/**
 * components/SettingsForm.tsx — business settings (client component).
 *
 * - Auto-post toggle (off by default; LOCKED rule: only applies to 4-5★ reviews.
 *   1-3★ always require manual approval — this is not user-configurable, per
 *   Product-Roadmap.md Phase 2.)
 * - Review-request message template editor with merge fields.
 * - Notification preferences (new-review email/SMS, daily digest).
 */

import { useState } from "react";
import type { Business } from "@/lib/types";

export default function SettingsForm({ business }: { business: Business }) {
  const [autoPost, setAutoPost] = useState(business.auto_post_positive_reviews);
  const [template, setTemplate] = useState(business.review_request_template);
  const [notifyEmail, setNotifyEmail] = useState(business.notify_new_review_email);
  const [notifySms, setNotifySms] = useState(business.notify_new_review_sms);
  const [digest, setDigest] = useState(business.daily_digest);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/businesses/${business.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auto_post_positive_reviews: autoPost,
          review_request_template: template,
          notify_new_review_email: notifyEmail,
          notify_new_review_sms: notifySms,
          daily_digest: digest,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Save failed");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="font-display text-2xl font-bold text-cream">Settings</h1>

      {/* Auto-post */}
      <section className="rounded-xl border border-cream/10 bg-ink-2 p-5">
        <h2 className="mb-1 font-display text-lg font-semibold text-cream">
          Auto-post replies
        </h2>
        <p className="mb-4 text-sm text-cream-dim">
          When on, AI-drafted replies are posted automatically for{" "}
          <strong className="text-cream">4 and 5-star reviews only</strong>. Reviews of 1-3
          stars always wait for your manual approval — no exceptions.
        </p>
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={autoPost}
            onChange={(e) => setAutoPost(e.target.checked)}
            className="h-5 w-5 rounded border-cream/30 bg-ink-3 text-brass focus:ring-brass"
          />
          <span className="text-sm text-cream">
            Auto-post drafts for positive (4-5★) reviews
          </span>
        </label>
      </section>

      {/* Message template */}
      <section className="rounded-xl border border-cream/10 bg-ink-2 p-5">
        <h2 className="mb-1 font-display text-lg font-semibold text-cream">
          Review request message
        </h2>
        <p className="mb-3 text-sm text-cream-dim">
          This is sent to customers when you ask them for a review. Merge fields:{" "}
          <code className="text-brass-light">{"{customer_name}"}</code>{" "}
          <code className="text-brass-light">{"{business_name}"}</code>{" "}
          <code className="text-brass-light">{"{review_link}"}</code>
        </p>
        <textarea
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          rows={4}
          className="w-full rounded-lg border border-cream/15 bg-ink-3 p-3 text-sm text-cream focus:border-brass focus:outline-none"
        />
      </section>

      {/* Notifications */}
      <section className="rounded-xl border border-cream/10 bg-ink-2 p-5">
        <h2 className="mb-4 font-display text-lg font-semibold text-cream">
          New review notifications
        </h2>
        <div className="space-y-3">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={notifyEmail}
              onChange={(e) => setNotifyEmail(e.target.checked)}
              className="h-5 w-5 rounded border-cream/30 bg-ink-3 text-brass focus:ring-brass"
            />
            <span className="text-sm text-cream">Email me when a new review arrives</span>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={notifySms}
              onChange={(e) => setNotifySms(e.target.checked)}
              className="h-5 w-5 rounded border-cream/30 bg-ink-3 text-brass focus:ring-brass"
            />
            <span className="text-sm text-cream">Text me when a new review arrives</span>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={digest}
              onChange={(e) => setDigest(e.target.checked)}
              className="h-5 w-5 rounded border-cream/30 bg-ink-3 text-brass focus:ring-brass"
            />
            <span className="text-sm text-cream">Send me a daily digest instead</span>
          </label>
        </div>
      </section>

      <div className="flex items-center gap-4">
        <button
          onClick={save}
          disabled={busy}
          className="rounded-lg bg-brass px-6 py-2.5 font-semibold text-ink transition hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save settings"}
        </button>
        {saved && <span className="text-sm text-green-400">✓ Saved</span>}
        {error && <span className="text-sm text-coral">{error}</span>}
      </div>
    </div>
  );
}