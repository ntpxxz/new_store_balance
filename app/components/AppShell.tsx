"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Home, Download, Box, Flask, ChevronLeft, Refresh, Sync, Monitor, Check, X } from "./icons";
import { api } from "@/lib/client";

const NAV = [
  { key: "home", label: "Home", href: "/receive", Icon: Home },
  { key: "receive", label: "Receive", href: "/receive", Icon: Download },
  { key: "parts", label: "Parts", href: "/parts", Icon: Box },
  { key: "iqc", label: "IQC", href: "/iqc", Icon: Flask },
];

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
  } catch {}
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
    const t = setInterval(pollQueue, 4000);
    return () => clearInterval(t);
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
          <h1 className="flex-1 text-center lg:text-left text-base lg:text-xl font-bold truncate">{title}</h1>
          {queue.length > 0 && (
            <button onClick={() => setModalOpen(true)} title="AS400 รอยืนยัน"
              className="relative text-lg p-1" style={{ color: "#dc2626" }}>
              <Monitor />
              <span className="absolute -top-0.5 -right-0.5 text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center"
                style={{ background: "#dc2626", color: "#fff" }}>
                {queue.length}
              </span>
            </button>
          )}
          {onSync && (
            <button onClick={onSync} disabled={syncBusy} aria-label="Sync" title="Sync from PBASS"
              className="text-lg p-1 disabled:opacity-40 transition-opacity" style={{ color: "var(--primary)" }}>
              <Sync className={syncBusy ? "animate-spin" : ""} />
            </button>
          )}
          {onRefresh && (
            <button onClick={onRefresh} aria-label="Refresh" title="Refresh" className="text-lg p-1" style={{ color: "var(--muted)" }}>
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
                <div className="font-bold text-base">AS400 รอยืนยัน</div>
                <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                  RPA กรอกข้อมูลครบแล้ว — กรุณาตรวจสอบหน้าจอแล้วกดยืนยัน
                </div>
              </div>
              {queue.length > 1 && (
                <span className="text-xs px-2 py-1 rounded-full font-semibold"
                  style={{ background: "#fee2e2", color: "#dc2626" }}>
                  {queue.length} รายการ
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
              {current.matLot    && <Field label="Mat Lot" value={current.matLot} />}
              {current.itemNo    && <Field label="Item" value={current.itemNo} />}
              {current.stockQty  != null && <Field label="Qty" value={String(current.stockQty)} />}
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
                  รอหน้าจอ AS400…
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 px-5 py-4 border-t" style={{ borderColor: "var(--border)" }}>
              <button disabled={busy} onClick={() => act("confirm")}
                className="flex-1 py-3 rounded-lg font-bold text-sm disabled:opacity-50 inline-flex items-center justify-center gap-2"
                style={{ background: "#16a34a", color: "#fff" }}>
                {busy ? "…" : <><Check /> ยืนยัน (Enter)</>}
              </button>
              <button disabled={busy} onClick={() => act("reject")}
                className="flex-1 py-3 rounded-lg font-bold text-sm disabled:opacity-50 inline-flex items-center justify-center gap-2"
                style={{ background: "#dc2626", color: "#fff" }}>
                {busy ? "…" : <><X /> ยกเลิก (F3)</>}
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
