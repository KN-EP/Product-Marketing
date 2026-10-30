"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const GROUPS: { label: string; links: { href: string; label: string }[] }[] = [
  { label: "Overview", links: [{ href: "/dashboard", label: "Dashboard" }, { href: "/demo", label: "Guided demo" }] },
  {
    label: "Knowledge",
    links: [
      { href: "/products", label: "Products" },
      { href: "/knowledge/sources", label: "Sources" },
      { href: "/knowledge/claims", label: "Claims" },
      { href: "/personas", label: "Personas" },
      { href: "/competitors", label: "Competitors" },
    ],
  },
  {
    label: "Work",
    links: [
      { href: "/campaigns", label: "Campaigns" },
      { href: "/releases", label: "Releases" },
      { href: "/workflows", label: "Workflows" },
      { href: "/assets", label: "Assets" },
      { href: "/approvals", label: "Approvals" },
    ],
  },
  { label: "Admin", links: [{ href: "/settings", label: "Settings" }] },
];

function AppNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-5 text-sm">
      {GROUPS.map((g) => (
        <div key={g.label} className="flex flex-col gap-1">
          <p className="px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{g.label}</p>
          <ul className="flex flex-col">
            {g.links.map((l) => {
              const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "block rounded-md px-2 py-1.5 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                      active && "bg-muted font-medium",
                    )}
                  >
                    {l.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/**
 * Sidebar navigation on ≥768 px; below that a compact "Menu" disclosure
 * (closed by default, closes on navigation). `footer` holds identity + sign out.
 */
export function NavShell({ footer }: { footer: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  return (
    <>
      <button
        type="button"
        className="absolute right-3 top-3 rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
        aria-expanded={open}
        aria-controls="app-nav"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "Close menu" : "Menu"}
      </button>
      <div id="app-nav" className={cn(open ? "block" : "hidden", "mt-3 md:mt-0 md:block")}>
        <AppNav />
        {footer}
      </div>
    </>
  );
}
