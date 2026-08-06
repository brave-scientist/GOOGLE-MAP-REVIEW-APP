"use client";

/**
 * components/RequestsManager.tsx — review request management (client component).
 *
 * Phase 3 priority order (locked):
 *   1. Quick-add form (primary, always visible) — name + phone, email optional
 *   2. Paste-a-list textarea (secondary) — parse → preview → confirm send
 *   3. CSV upload (tertiary, behind a link) — upload → preview → confirm send
 *
 * All three funnel into the same review_requests table with entry_method.
 * Shows a running list of all requests with send status.
 */

import { useState, useCallback } from "react";
import type { Business, ReviewRequest } from "@/lib/types";

export default function RequestsManager({
  business,
  initialRequests,
}: {
  business: Business;
  initialRequests: ReviewRequest[];
}) {
  const [requests, setRequests] = useState(initialRequests);
  const [tab, setTab] = useState<"quick" | "paste" | "csv">("quick");

  // Quick-add fields
  const [qaName, setQaName] = useState("");
  const [qaPhone, setQaPhone] = useState("");
  const [qaEmail, setQaEmail] = useState("");
  const [qaBusy, setQaBusy] = useState(false);
  const [qaError, setQaError] = useState<string | null>(null);
  const [qaSuccess, setQaSuccess] = useState(false);

  // Paste fields
  const [pasteText, setPasteText] = useState("");
  const [pastePreview, setPastePreview] = useState<
    Array<{ name: string; contact: string; channel: "sms" | "email" }>
  >([]);
  const [pasteUnparsed, setPasteUnparsed] = useState<string[]>([]);
  const [pasteBusy, setPasteBusy] = useState(false);
  const [pasteError, setPasteError] = useState<string | null>(null);

  // CSV fields
  const [csvPreview, setCsvPreview] = useState<
    Array<{ name: string; contact: string; channel: "sms" | "email" }>
  >([]);
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/businesses/${business.id}/review-requests`);
    const data = await res.json();
    if (data.ok) setRequests(data.requests);
  }, [business.id]);

  // ---- Quick-add (primary) ----
  async function handleQuickAdd(e: React.FormEvent) {
    e.preventDefault();
    setQaBusy(true);
    setQaError(null);
    setQaSuccess(false);
    try {
      const res = await fetch(`/api/businesses/${business.id}/review-requests/quick-add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: qaName, phone: qaPhone, email: qaEmail }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Failed to add");
      setQaName("");
      setQaPhone("");
      setQaEmail("");
      setQaSuccess(true);
      setTimeout(() => setQaSuccess(false), 2000);
      await refresh();
    } catch (err) {
      setQaError(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setQaBusy(false);
    }
  }

  // ---- Paste-a-list (secondary) ----
  async function handleParsePaste() {
    setPasteBusy(true);
    setPasteError(null);
    try {
      const res = await fetch(`/api/businesses/${business.id}/review-requests/parse-paste`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pasteText }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Parse failed");
      setPastePreview(data.contacts);
      setPasteUnparsed(data.unparsed);
    } catch (err) {
      setPasteError(err instanceof Error ? err.message : "Parse failed");
    } finally {
      setPasteBusy(false);
    }
  }

  async function handleSendPaste() {
    setPasteBusy(true);
    setPasteError(null);
    try {
      const res = await fetch(`/api/businesses/${business.id}/review-requests/send-batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts: pastePreview, entry_method: "paste_list" }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Send failed");
      setPasteText("");
      setPastePreview([]);
      setPasteUnparsed([]);
      await refresh();
    } catch (err) {
      setPasteError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setPasteBusy(false);
    }
  }

  // ---- CSV upload (tertiary) ----
  async function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvBusy(true);
    setCsvError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/businesses/${business.id}/review-requests/upload`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Upload failed");
      setCsvPreview(data.contacts);
    } catch (err) {
      setCsvError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setCsvBusy(false);
    }
  }

  async function handleSendCsv() {
    setCsvBusy(true);
    setCsvError(null);
    try {
      const res = await fetch(`/api/businesses/${business.id}/review-requests/send-batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts: csvPreview, entry_method: "csv_import" }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Send failed");
      setCsvPreview([]);
      await refresh();
    } catch (err) {
      setCsvError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setCsvBusy(false);
    }
  }

  const STATUS_STYLES: Record<string, string> = {
    queued: "bg-ink-3 text-cream-dim",
    sent: "bg-brass/15 text-brass-light",
    clicked: "bg-green-500/15 text-green-400",
    failed: "bg-coral/15 text-coral",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-cream">Review Requests</h1>
        <p className="mt-1 text-sm text-cream-dim">
          Ask your customers for a review. Add them one at a time, paste a list, or upload a spreadsheet.
        </p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab("quick")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            tab === "quick" ? "bg-brass text-ink" : "border border-cream/15 text-cream-dim hover:text-cream"
          }`}
        >
          Quick add
        </button>
        <button
          onClick={() => setTab("paste")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            tab === "paste" ? "bg-brass text-ink" : "border border-cream/15 text-cream-dim hover:text-cream"
          }`}
        >
          Paste a list
        </button>
        <button
          onClick={() => setTab("csv")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            tab === "csv" ? "bg-brass text-ink" : "border border-cream/15 text-cream-dim hover:text-cream"
          }`}
        >
          Upload CSV
        </button>
      </div>

      {/* Quick-add (primary) */}
      {tab === "quick" && (
        <form onSubmit={handleQuickAdd} className="rounded-xl border border-cream/10 bg-ink-2 p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-cream">Name *</label>
              <input
                required
                value={qaName}
                onChange={(e) => setQaName(e.target.value)}
                placeholder="Jane Smith"
                className="w-full rounded-lg border border-cream/15 bg-ink-3 px-4 py-3 text-cream placeholder:text-cream-dim/60 focus:border-brass focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-cream">Phone *</label>
              <input
                required
                value={qaPhone}
                onChange={(e) => setQaPhone(e.target.value)}
                placeholder="555-123-4567"
                className="w-full rounded-lg border border-cream/15 bg-ink-3 px-4 py-3 text-cream placeholder:text-cream-dim/60 focus:border-brass focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-cream">Email (optional)</label>
              <input
                value={qaEmail}
                onChange={(e) => setQaEmail(e.target.value)}
                placeholder="jane@email.com"
                className="w-full rounded-lg border border-cream/15 bg-ink-3 px-4 py-3 text-cream placeholder:text-cream-dim/60 focus:border-brass focus:outline-none"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={qaBusy}
            className="mt-4 rounded-lg bg-brass px-6 py-2.5 font-semibold text-ink transition hover:brightness-110 disabled:opacity-50"
          >
            {qaBusy ? "Sending…" : "Add & send"}
          </button>
          {qaSuccess && <span className="ml-3 text-sm text-green-400">✓ Sent!</span>}
          {qaError && <span className="ml-3 text-sm text-coral">{qaError}</span>}
        </form>
      )}

      {/* Paste-a-list (secondary) */}
      {tab === "paste" && (
        <div className="rounded-xl border border-cream/10 bg-ink-2 p-5">
          <label className="mb-2 block text-sm font-medium text-cream">
            Paste names and numbers, one per line
          </label>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={6}
            placeholder={"Jane Smith, 555-1234\nJohn Doe - 555-5678\nMary Johnson 5559012345"}
            className="w-full rounded-lg border border-cream/15 bg-ink-3 p-3 text-sm text-cream placeholder:text-cream-dim/60 focus:border-brass focus:outline-none"
          />
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleParsePaste}
              disabled={pasteBusy || !pasteText.trim()}
              className="rounded-lg border border-cream/20 px-4 py-2 text-sm font-medium text-cream-dim transition hover:border-brass hover:text-brass-light disabled:opacity-50"
            >
              {pasteBusy ? "Parsing…" : "Parse"}
            </button>
            {pastePreview.length > 0 && (
              <button
                onClick={handleSendPaste}
                disabled={pasteBusy}
                className="rounded-lg bg-brass px-4 py-2 text-sm font-semibold text-ink transition hover:brightness-110 disabled:opacity-50"
              >
                Send to {pastePreview.length}
              </button>
            )}
          </div>
          {pasteError && <p className="mt-2 text-sm text-coral">{pasteError}</p>}
          {pastePreview.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-sm text-green-400">
                Found {pastePreview.length} contact{pastePreview.length === 1 ? "" : "s"}
                {pasteUnparsed.length > 0 && ` · ${pasteUnparsed.length} unparsed`}
              </p>
              <ul className="space-y-1 text-sm text-cream-dim">
                {pastePreview.map((c, i) => (
                  <li key={i} className="flex justify-between">
                    <span>{c.name}</span>
                    <span className="font-mono text-xs">{c.contact}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* CSV upload (tertiary) */}
      {tab === "csv" && (
        <div className="rounded-xl border border-cream/10 bg-ink-2 p-5">
          <p className="mb-3 text-sm text-cream-dim">
            Upload a CSV with name and phone/email columns. A header row is fine.
          </p>
          <input
            type="file"
            accept=".csv"
            onChange={handleCsvUpload}
            disabled={csvBusy}
            className="mb-3 block w-full text-sm text-cream-dim file:mr-3 file:rounded-lg file:border-0 file:bg-brass file:px-4 file:py-2 file:font-semibold file:text-ink"
          />
          {csvError && <p className="text-sm text-coral">{csvError}</p>}
          {csvPreview.length > 0 && (
            <div className="mt-3">
              <p className="mb-2 text-sm text-green-400">Found {csvPreview.length} contacts</p>
              <ul className="mb-3 space-y-1 text-sm text-cream-dim">
                {csvPreview.slice(0, 10).map((c, i) => (
                  <li key={i} className="flex justify-between">
                    <span>{c.name}</span>
                    <span className="font-mono text-xs">{c.contact}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={handleSendCsv}
                disabled={csvBusy}
                className="rounded-lg bg-brass px-4 py-2 text-sm font-semibold text-ink transition hover:brightness-110 disabled:opacity-50"
              >
                Send to {csvPreview.length}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Running list of all requests */}
      <div className="rounded-xl border border-cream/10 bg-ink-2 p-5">
        <h2 className="mb-3 font-display text-lg font-semibold text-cream">
          All requests ({requests.length})
        </h2>
        {requests.length === 0 ? (
          <p className="text-sm text-cream-dim">
            No requests yet. Add a customer above to get started.
          </p>
        ) : (
          <ul className="space-y-2">
            {requests.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 border-b border-cream/5 pb-2 last:border-0">
                <div className="min-w-0">
                  <span className="text-sm font-medium text-cream">{r.customer_name}</span>
                  <span className="ml-2 text-xs capitalize text-cream-dim">
                    via {r.entry_method.replace("_", " ")} · {r.channel}
                  </span>
                </div>
                <span className={`shrink-0 rounded px-2 py-0.5 text-xs ${STATUS_STYLES[r.status] ?? "bg-ink-3 text-cream-dim"}`}>
                  {r.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}