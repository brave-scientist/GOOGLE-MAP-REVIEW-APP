"use client";

/**
 * app/(marketing)/login/page.tsx — login + signup (mock mode).
 *
 * In mock mode, login and signup are the same action: enter any email, hit the
 * button, and the demo user is created or recalled. The seeded demo user is
 * owner@reviewreply.demo.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Sign-in failed");
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="font-display text-2xl font-bold text-cream">
            ReviewReply<span className="text-brass-light">-Lite</span>
          </div>
          <p className="mt-1 text-sm text-cream-dim">Sign in to your dashboard</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-cream/10 bg-ink-2 p-6"
        >
          <label className="mb-2 block text-sm font-medium text-cream" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="owner@example.com"
            className="mb-4 w-full rounded-lg border border-cream/15 bg-ink-3 px-4 py-3 text-cream placeholder:text-cream-dim/60 focus:border-brass focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-brass py-3 font-semibold text-ink transition hover:brightness-110 disabled:opacity-50"
          >
            {busy ? "Signing in…" : "Sign in / Sign up"}
          </button>
          {error && (
            <p className="mt-3 text-sm text-coral">{error}</p>
          )}
        </form>

        <p className="mt-4 text-center text-xs text-cream-dim">
          Demo mode — any email works. Try <code className="text-brass-light">owner@reviewreply.demo</code>
        </p>
      </div>
    </main>
  );
}