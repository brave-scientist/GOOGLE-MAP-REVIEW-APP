"use client";

/**
 * components/AppNav.tsx — top navigation for the authenticated app shell.
 *
 * Renders the logo, the primary nav (Dashboard, Reviews, Requests, Settings,
 * Billing), a business picker (for users with multiple businesses), and the
 * logged-in user's email + sign-out.
 */

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Business } from "@/lib/types";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/reviews", label: "Reviews" },
  { href: "/requests", label: "Requests" },
  { href: "/settings", label: "Settings" },
  { href: "/billing", label: "Billing" },
];

export default function AppNav({
  businesses,
  activeBusinessId,
  userEmail,
}: {
  businesses: Business[];
  activeBusinessId: string;
  userEmail: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState(activeBusinessId);

  const active = businesses.find((b) => b.id === activeId) ?? businesses[0];

  const visibleNavItems = [...NAV_ITEMS];
  if (businesses.length > 1) {
    visibleNavItems.unshift({ href: "/org-dashboard", label: "Organization" });
  }

  async function handleSwitch(e: React.ChangeEvent<HTMLSelectElement>) {
    const nextId = e.target.value;
    setActiveId(nextId);
    await fetch("/api/auth/active-business", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId: nextId }),
    });
    router.refresh();
  }

  async function signOut() {
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-50 border-b border-cream/10 bg-ink/95 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-8">
          <div className="font-display text-lg font-bold text-cream">
            ReviewReply<span className="text-brass-light">-Lite</span>
          </div>
          <div className="hidden items-center gap-1 md:flex">
            {visibleNavItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <a
                  key={item.href}
                  href={item.href}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                    active
                      ? "bg-brass/15 text-brass-light"
                      : "text-cream-dim hover:text-cream"
                  }`}
                >
                  {item.label}
                </a>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-4">
          {active && businesses.length > 1 ? (
            <div className="hidden sm:block">
              <select
                value={activeId}
                onChange={handleSwitch}
                className="rounded-lg border border-cream/10 bg-ink-2 px-3 py-1.5 text-sm font-medium text-cream focus:border-brass focus:outline-none"
              >
                {businesses.map((b) => (
                  <option key={b.id} value={b.id} className="bg-ink-2 text-cream">
                    {b.name} ({b.category})
                  </option>
                ))}
              </select>
            </div>
          ) : active ? (
            <div className="hidden text-right sm:block">
              <div className="text-sm font-medium text-cream">{active.name}</div>
              <div className="text-xs capitalize text-cream-dim">{active.category}</div>
            </div>
          ) : null}
          <div className="relative">
            <button
              onClick={() => setOpen((v) => !v)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-cream/20 text-sm font-medium text-cream-dim transition hover:border-brass hover:text-brass-light"
              aria-label="Account menu"
            >
              {userEmail.charAt(0).toUpperCase()}
            </button>
            {open && (
              <div className="absolute right-0 mt-2 w-56 rounded-lg border border-cream/10 bg-ink-2 p-2 shadow-xl">
                <div className="px-3 py-2 text-xs text-cream-dim">{userEmail}</div>
                <button
                  onClick={signOut}
                  className="w-full rounded-md px-3 py-2 text-left text-sm text-cream-dim transition hover:bg-ink-3 hover:text-cream"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile nav */}
      <div className="flex gap-1 overflow-x-auto px-6 pb-2 md:hidden">
        {visibleNavItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <a
              key={item.href}
              href={item.href}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition ${
                isActive ? "bg-brass/15 text-brass-light" : "text-cream-dim"
              }`}
            >
              {item.label}
            </a>
          );
        })}
      </div>
    </header>
  );
}