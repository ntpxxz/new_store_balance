"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Home, Download, Box, Upload, Circle, ChevronLeft, Refresh, Sync } from "./icons";

const NAV = [
  { key: "home", label: "Home", href: "/receive", Icon: Home },
  { key: "receive", label: "Receive", href: "/receive", Icon: Download },
  { key: "parts", label: "Parts", href: "/parts", Icon: Box },
  { key: "issue", label: "Issue", href: "/receive", Icon: Upload },
  { key: "location", label: "Location", href: "/receive", Icon: Circle },
];

export default function AppShell({
  title,
  active = "receive",
  showBack = false,
  onRefresh,
  onSync,
  syncBusy = false,
  children,
}: {
  title: string;
  active?: string;
  showBack?: boolean;
  onRefresh?: () => void;
  onSync?: () => void;
  syncBusy?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <div className="lg:flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r bg-white px-4 py-6" style={{ borderColor: "var(--border)" }}>
        <div className="px-2">
          <div className="text-lg font-extrabold tracking-tight">FORM INVENTORY</div>
          <div className="text-xs" style={{ color: "var(--muted)" }}>Main Warehouse</div>
        </div>
        <div className="my-4 h-px" style={{ background: "var(--border)" }} />
        <nav className="flex flex-col gap-1">
          {NAV.slice(1).map(({ key, label, href, Icon }) => {
            const on = key === active;
            return (
              <Link key={key} href={href}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium"
                style={on ? { background: "var(--primary-tint)", color: "var(--primary)" } : { color: "var(--muted)" }}>
                <Icon className="text-lg" /> {label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="sticky top-0 z-20 flex items-center gap-3 px-4 lg:px-8 h-16 shrink-0" style={{ background: "var(--header)" }}>
          {showBack && (
            <button onClick={() => router.back()} aria-label="Back" className="text-xl -ml-1 p-1">
              <ChevronLeft />
            </button>
          )}
          <h1 className="flex-1 text-center lg:text-left text-base lg:text-xl font-bold truncate">{title}</h1>
          {onSync && (
            <button onClick={onSync} disabled={syncBusy} aria-label="Sync from PBASS" title="Sync from PBASS"
              className="text-lg p-1 disabled:opacity-40 transition-opacity" style={{ color: "var(--primary)" }}>
              <Sync className={syncBusy ? "animate-spin" : ""} />
            </button>
          )}
          {onRefresh && (
            <button onClick={onRefresh} aria-label="Refresh list" title="Refresh list" className="text-lg p-1" style={{ color: "var(--muted)" }}>
              <Refresh />
            </button>
          )}
        </header>

        {/* Content */}
        <main className="flex-1 px-4 lg:px-8 py-4 lg:py-6 pb-24 lg:pb-6">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-10 flex border-t bg-white px-2 py-2"
        style={{ borderColor: "var(--border)" }}>
        {NAV.map(({ key, label, href, Icon }) => {
          const on = key === active;
          return (
            <Link key={key} href={href} className="flex-1 flex flex-col items-center gap-0.5 text-[11px]"
              style={{ color: on ? "var(--primary)" : "var(--muted)" }}>
              <Icon className="text-xl" /> {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
