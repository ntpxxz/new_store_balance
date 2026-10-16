"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Home, Download, Box, List, Barcode, ChevronLeft, Refresh, Sync, Monitor, Check, X } from "./icons";
import { api, getUser, logout } from "@/lib/client";
import { useLang } from "@/lib/lang";
import { useTheme } from "@/lib/theme";

type QueueRow = {
  id: number;
  vendorCode?: string | null;
  vendorName?: string | null;
  matLot?: string | null;
  itemNo?: string | null;
  stockQty?: number | null;
  screenshot?: string | null;
  createdAt: string;
};

function beep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start(); osc.stop(ctx.currentTime + 0.5);
  } catch { }
}

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function AvatarIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <circle cx="14" cy="14" r="14" fill="var(--primary-tint)" />
      <circle cx="14" cy="11" r="4" fill="var(--primary)" />
      <path d="M5 24c0-4.418 4.03-8 9-8s9 3.582 9 8" fill="var(--primary)" />
    </svg>
  );
}

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
  const { t, lang, setLang } = useLang();
  const { theme, toggle: toggleTheme } = useTheme();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const NAV = [
    { key: "home", label: t.nav.home, href: "/", Icon: Home },
    { key: "receive", label: t.nav.receive, href: "/receive", Icon: Download },
    { key: "parts", label: t.nav.parts, href: "/parts", Icon: Box },

    { key: "bin", label: t.nav.bin, href: "/bin", Icon: Barcode },
  ];

  // ── AS400 confirm modal ─────────────────────────────────────────────────────
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const prevCount = useRef(0);

  const pollQueue = useCallback(async () => {
    try {
      const data: QueueRow[] = await api.listAs400Queue();
      setQueue(data);
      if (data.length > prevCount.current) {
        beep();
        setModalOpen(true);
      }
      prevCount.current = data.length;
    } catch (e: any) {
      console.warn("[AS400 poll]", e?.message ?? e);
    }
  }, []);

  useEffect(() => {
    pollQueue();
    const timer = setInterval(pollQueue, 4000);
    return () => clearInterval(timer);
  }, [pollQueue]);

  const current = queue[0] ?? null;

  async function act(action: "confirm" | "reject") {
    if (!current) return;
    setBusy(true);
    try {
      if (action === "confirm") await api.confirmAs400(current.id);
      else await api.rejectAs400(current.id);
      await pollQueue();
      setModalOpen(false);
      router.refresh();
    } catch (e: any) { alert(e.message); }
    finally { setBusy(false); }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="lg:flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r px-4 py-6"
        style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        <div className="px-2">
          <div className="text-lg font-extrabold tracking-tight">SPD-STOREHOUSE</div>
          <div className="text-xs" style={{ color: "var(--muted)" }}>{t.nav.subtitle}</div>
        </div>
        <div className="my-4 h-px" style={{ background: "var(--border)" }} />
        <nav className="flex flex-col gap-1">
          {NAV.slice(1).map(({ key, label, href, Icon }) => {
            const on = key === active;
            return (
              <Link key={key} href={href}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium"
                style={on ? { background: "var(--primary-tint)", color: "var(--primary)" } : { color: "var(--muted)" }}>
                <Icon className="text-lg" />
                <span className="flex-1">{label}</span>
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
          <h1 className="flex-1 text-center text-base lg:text-xl font-bold truncate">{title}</h1>

          {queue.length > 0 && (
            <button onClick={() => setModalOpen(true)} title={t.as400.title}
              className="relative text-lg p-1" style={{ color: "#dc2626" }}>
              <Monitor />
              <span className="absolute -top-0.5 -right-0.5 text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center"
                style={{ background: "#dc2626", color: "#fff" }}>
                {queue.length}
              </span>
            </button>
          )}
          {onSync && (
            <button onClick={onSync} disabled={syncBusy} aria-label="Sync" title="Sync"
              className="text-lg p-1 disabled:opacity-40 transition-opacity" style={{ color: "var(--primary)" }}>
              <Sync className={syncBusy ? "animate-spin" : ""} />
            </button>
          )}
          {onRefresh && (
            <button onClick={onRefresh} aria-label="Refresh" title="Refresh" className="text-lg p-1" style={{ color: "var(--muted)" }}>
              <Refresh />
            </button>
          )}

          {/* Settings */}
          <div className="relative">
            <button onClick={() => setSettingsOpen(o => !o)} aria-label="Settings" className="p-0.5 rounded-full">
              <AvatarIcon />
            </button>
            {settingsOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setSettingsOpen(false)} />
                <div className="absolute right-0 top-full mt-2 z-40 w-52 rounded-xl shadow-lg border py-2"
                  style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                  {/* User info */}
                  <div className="px-4 py-2.5 border-b" style={{ borderColor: "var(--border)" }}>
                    <div className="text-sm font-semibold truncate">{getUser()?.username ?? "—"}</div>
                    <div className="text-xs" style={{ color: "var(--muted)" }}>{getUser()?.role ?? ""}</div>
                  </div>
                  {/* Language */}
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-sm" style={{ color: "var(--muted)" }}>
                      {lang === "th" ? "ภาษา" : "Language"}
                    </span>
                    <button onClick={() => setLang(lang === "en" ? "th" : "en")}
                      className="text-xs font-bold px-2.5 py-1 rounded-md border"
                      style={{ borderColor: "var(--border)", color: "var(--primary)", background: "var(--primary-tint)" }}>
                      {lang === "en" ? "TH" : "EN"}
                    </button>
                  </div>
                  {/* Theme */}
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-sm" style={{ color: "var(--muted)" }}>
                      {lang === "th" ? "ธีม" : "Theme"}
                    </span>
                    <button onClick={toggleTheme} className="text-sm p-1 rounded-md" style={{ color: "var(--muted)" }}>
                      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
                    </button>
                  </div>
                  {/* Admin settings */}
                  {getUser()?.role === "ADMIN" && (
                    <Link href="/settings" onClick={() => setSettingsOpen(false)}
                      className="block px-4 py-2.5 text-sm font-medium" style={{ color: "var(--primary)" }}>
                      {lang === "th" ? "จัดการผู้ใช้" : "Manage users"}
                    </Link>
                  )}
                  {/* Logout */}
                  <div className="border-t mt-1 pt-1" style={{ borderColor: "var(--border)" }}>
                    <button onClick={logout}
                      className="w-full text-left px-4 py-2.5 text-sm font-medium"
                      style={{ color: "#dc2626" }}>
                      {lang === "th" ? "ออกจากระบบ" : "Log out"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 px-4 lg:px-8 py-4 lg:py-6 pb-24 lg:pb-6">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-10 flex border-t px-2 py-2"
        style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        {NAV.map(({ key, label, href, Icon }) => {
          const on = key === active;
          return (
            <Link key={key} href={href} className="flex-1 flex flex-col items-center gap-1 text-xs font-medium py-1"
              style={{ color: on ? "var(--primary)" : "var(--muted)" }}>
              <Icon className="text-xl" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* ── AS400 Confirm Modal ── */}
      {modalOpen && current && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={e => { if (e.target === e.currentTarget) setModalOpen(false); }}>
          <div className="w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden flex flex-col"
            style={{ background: "var(--card)", maxHeight: "90vh" }}>

            {/* Modal header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
              <div className="flex-1">
                <div className="font-bold text-base">{t.as400.title}</div>
                <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>{t.as400.desc}</div>
              </div>
              {queue.length > 1 && (
                <span className="text-xs px-2 py-1 rounded-full font-semibold"
                  style={{ background: "#fee2e2", color: "#dc2626" }}>
                  {t.as400.items(queue.length)}
                </span>
              )}
              <button onClick={() => setModalOpen(false)} aria-label="Close" className="text-xl leading-none p-1"
                style={{ color: "var(--muted)" }}><X /></button>
            </div>

            {/* Info row */}
            <div className="flex flex-wrap gap-x-5 gap-y-1 px-5 py-3 text-sm border-b"
              style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
              {current.vendorCode && <Field label="Vendor" value={current.vendorCode} />}
              {current.vendorName && <Field label="Name" value={current.vendorName} />}
              {current.matLot && <Field label="Mat Lot" value={current.matLot} />}
              {current.itemNo && <Field label="Item" value={current.itemNo} />}
              {current.stockQty != null && <Field label="Qty" value={String(current.stockQty)} />}
            </div>

            {/* AS400 screen text */}
            <div className="overflow-auto flex-1">
              {current.screenshot ? (
                <pre style={{
                  background: "#111", color: "#00ff41",
                  fontFamily: "'Courier New', Courier, monospace",
                  fontSize: "11px", lineHeight: "1.35",
                  padding: "12px 16px", whiteSpace: "pre", margin: 0,
                }}>
                  {current.screenshot}
                </pre>
              ) : (
                <div className="p-8 text-center text-sm" style={{ color: "var(--muted)" }}>
                  {t.as400.waiting}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 px-5 py-4 border-t" style={{ borderColor: "var(--border)" }}>
              <button disabled={busy} onClick={() => act("confirm")}
                className="flex-1 py-3 rounded-lg font-bold text-sm disabled:opacity-50 inline-flex items-center justify-center gap-2"
                style={{ background: "#16a34a", color: "#fff" }}>
                {busy ? "…" : <><Check /> {t.as400.confirm}</>}
              </button>
              <button disabled={busy} onClick={() => act("reject")}
                className="flex-1 py-3 rounded-lg font-bold text-sm disabled:opacity-50 inline-flex items-center justify-center gap-2"
                style={{ background: "#dc2626", color: "#fff" }}>
                {busy ? "…" : <><X /> {t.as400.cancel}</>}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span style={{ color: "var(--muted)" }}>{label}: </span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
