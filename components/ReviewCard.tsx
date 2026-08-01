"use client";

/**
 * components/ReviewCard.tsx — a single review with its AI draft + reply actions.
 *
 * Implements Phase 1 (list display) + Phase 2 (reply UI) in one component:
 *   - Source icon, rating, reviewer name, review text, status badge
 *   - AI-generated draft in an editable textarea
 *   - "Regenerate" button (re-runs the draft engine)
 *   - "Post Reply" button (simulated post via the integration layer)
 *
 * Calls:
 *   POST /api/reviews/[id]/draft   — generate / regenerate draft
 *   POST /api/reviews/[id]/reply   — post the (possibly edited) reply
 */

import { useState } from "react";
import type { Business, Review, ReviewReply } from "@/lib/types";

const STATUS_STYLES: Record<Review["status"], string> = {
  new: "bg-coral/15 text-coral",
  draft_generated: "bg-brass/15 text-brass-light",
  replied: "bg-green-500/15 text-green-400",
  ignored: "bg-ink-3 text-cream-dim",
};

export default function ReviewCard({
  review,
  reply,
  business,
}: {
  review: Review;
  reply: ReviewReply | null;
  business: Business;
}) {
  const [draft, setDraft] = useState(reply?.draft_text ?? "");
  const [status, setStatus] = useState(review.status);
  const [postedAt, setPostedAt] = useState(reply?.posted_at ?? null);
  const [busy, setBusy] = useState<"draft" | "post" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generateDraft() {
    setBusy("draft");
    setError(null);
    try {
      const res = await fetch(`/api/reviews/${review.id}/draft`, { method: "POST" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Draft failed");
      setDraft(data.draft);
      setStatus("draft_generated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Draft failed");
    } finally {
      setBusy(null);
    }
  }

  async function postReply() {
    setBusy("post");
    setError(null);
    try {
      const res = await fetch(`/api/reviews/${review.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: draft }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Post failed");
      setStatus("replied");
      setPostedAt(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Post failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border border-cream/10 bg-ink-2 p-5">
      {/* Review header */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-cream">{review.reviewer_name}</span>
            <span className="text-sm text-coral">
              {"★".repeat(review.rating)}
              {"☆".repeat(5 - review.rating)}
            </span>
          </div>
          <p className="mt-1 text-sm text-cream-dim">{review.review_text}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="rounded bg-ink-3 px-2 py-0.5 font-mono text-xs text-cream-dim">
            {review.source}
          </span>
          <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLES[status]}`}>
            {status.replace("_", " ")}
          </span>
        </div>
      </div>

      {/* Posted reply (read-only) */}
      {status === "replied" && reply?.final_text ? (
        <div className="mt-3 rounded-lg border border-green-500/20 bg-green-500/5 p-4">
          <div className="mb-1 font-mono text-xs uppercase tracking-wide text-green-400">
            Reply posted
          </div>
          <p className="text-sm text-cream">{reply.final_text}</p>
        </div>
      ) : (
        /* Draft + actions */
        <div className="mt-3">
          {draft ? (
            <>
              <label className="mb-1 block font-mono text-xs uppercase tracking-wide text-brass-light">
                AI draft {reply?.posted_by === "auto" && "(auto-posted)"}
              </label>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-brass/30 bg-brass/5 p-3 text-sm text-cream focus:border-brass focus:outline-none"
              />
              <div className="mt-2 flex gap-2">
                <button
                  onClick={postReply}
                  disabled={busy !== null || !draft.trim()}
                  className="rounded-lg bg-brass px-4 py-2 text-sm font-semibold text-ink transition hover:brightness-110 disabled:opacity-50"
                >
                  {busy === "post" ? "Posting…" : "Post Reply"}
                </button>
                <button
                  onClick={generateDraft}
                  disabled={busy !== null}
                  className="rounded-lg border border-cream/20 px-4 py-2 text-sm font-medium text-cream-dim transition hover:border-brass hover:text-brass-light disabled:opacity-50"
                >
                  {busy === "draft" ? "Regenerating…" : "Regenerate"}
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={generateDraft}
              disabled={busy !== null}
              className="rounded-lg border border-brass px-4 py-2 text-sm font-medium text-brass-light transition hover:bg-brass hover:text-ink disabled:opacity-50"
            >
              {busy === "draft" ? "Drafting…" : "Generate AI draft"}
            </button>
          )}
        </div>
      )}

      {postedAt && (
        <p className="mt-2 text-xs text-green-400">
          Posted {new Date(postedAt).toLocaleString()}
        </p>
      )}
      {error && <p className="mt-2 text-sm text-coral">{error}</p>}
    </div>
  );
}