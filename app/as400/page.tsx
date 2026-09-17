"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AppShell from "@/app/components/AppShell";
import { Check, X, Refresh } from "@/app/components/icons";
import { api } from "@/lib/client";
import { useAuthRedirect } from "@/lib/hooks";

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
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(); osc.stop(ctx.currentTime + 0.4);
  } catch {}
}

export default function AS400ConfirmPage() {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");
  const [busy, setBusy] = useState<Record<number, boolean>>({});
  const prevCount = useRef(0);

  const load = useCallback(async () => {
    try {
      const data = await api.listAs400Queue();
      setRows(data);
      setLoadErr("");
      if (data.length > prevCount.current) {
        beep();
        document.title = `(${data.length}) AS400 Confirm`;
      } else if (data.length === 0) {
        document.title = "AS400 Confirm Queue";
      }
      prevCount.current = data.length;
    } catch (e: any) { setLoadErr(e.message); }
    finally { setLoading(false); }
  }, []);

  useAuthRedirect();
  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  async function act(id: number, action: "confirm" | "reject") {
    setBusy(b => ({ ...b, [id]: true }));
    try {
      if (action === "confirm") await api.confirmAs400(id);
      else await api.rejectAs400(id);
      await load();
    } catch (e: any) { alert(e.message); }
    finally { setBusy(b => ({ ...b, [id]: false })); }
  }

  return (
    <AppShell title="AS400 Confirm Queue" active="as400" onRefresh={load}>
      <div className="max-w-3xl mx-auto flex flex-col gap-4">

        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
          <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ background: "var(--ok-fg)" }} />
          Live — refreshes every 3s
        </div>

        {loading && <Info>Loading…</Info>}
        {!loading && loadErr && <Info bad>{loadErr}</Info>}
        {!loading && !loadErr && rows.length === 0 && <Info>No items waiting for confirmation.</Info>}

        {rows.map(row => (
          <div key={row.id} className="card overflow-hidden">
            {/* Info row */}
            <div className="p-4 flex flex-wrap gap-x-6 gap-y-1 text-sm border-b" style={{ borderColor: "var(--border)" }}>
              <Field label="Vendor" value={row.vendorCode} />
              <Field label="Mat Lot" value={row.matLot} />
              <Field label="Item" value={row.itemNo} />
              <Field label="Qty" value={row.stockQty?.toString()} />
              <Field label="Vendor Name" value={row.vendorName} />
            </div>

            {/* AS400 screen text (24×80 terminal display) */}
            {row.screenshot ? (
              <pre style={{
                background: "#111", color: "#00ff41", fontFamily: "'Courier New', Courier, monospace",
                fontSize: "11px", lineHeight: "1.35", padding: "12px 16px",
                whiteSpace: "pre", overflowX: "auto", margin: 0, maxHeight: "320px",
                overflowY: "auto",
              }}>
                {row.screenshot}
              </pre>
            ) : (
              <div className="p-6 text-center text-sm" style={{ color: "var(--muted)" }}>Waiting for screen capture…</div>
            )}

            {/* Actions */}
            <div className="p-4 flex gap-3">
              <button
                className="btn flex-1 font-semibold gap-2"
                style={{ background: "#16a34a", color: "#fff" }}
                disabled={busy[row.id]}
                onClick={() => act(row.id, "confirm")}
              >
                <Check /> {busy[row.id] ? "…" : "Confirm"}
              </button>
              <button
                className="btn flex-1 font-semibold gap-2"
                style={{ background: "#dc2626", color: "#fff" }}
                disabled={busy[row.id]}
                onClick={() => act(row.id, "reject")}
              >
                <X /> {busy[row.id] ? "…" : "Reject"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <span style={{ color: "var(--muted)" }}>{label}: </span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function Info({ children, bad }: { children: React.ReactNode; bad?: boolean }) {
  return <div className="card p-8 text-center text-sm" style={{ color: bad ? "var(--bad-fg)" : "var(--muted)" }}>{children}</div>;
}
