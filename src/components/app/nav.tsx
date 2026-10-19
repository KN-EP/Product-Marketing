"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
      { href: "/workflows", label: "Workflows" },
      { href: "/assets", label: "Assets" },
      { href: "/approvals", label: "Approvals" },
    ],
  },
  { label: "Admin", links: [{ href: "/settings", label: "Settings" }] },
];

export function AppNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="-mx-1 flex flex-row gap-1 overflow-x-auto pb-1 text-sm md:mx-0 md:flex-col md:gap-5 md:overflow-visible md:pb-0">
      {GROUPS.map((g) => (
        <div key={g.label} className="flex shrink-0 flex-col gap-1">
          <p className="hidden px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground md:block">{g.label}</p>
          <ul className="flex flex-row md:flex-col">
            {g.links.map((l) => {
              const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "block whitespace-nowrap rounded-md px-2 py-1.5 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
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
