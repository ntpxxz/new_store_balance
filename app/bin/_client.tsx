"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import { Search, Scan, Archive } from "@/app/components/icons";
import { api, type BinRow } from "@/lib/client";
import { useSearchRef } from "@/lib/hooks";
import { Info } from "@/app/components/table";
import { useLang } from "@/lib/lang";

type BinConfig = { id: string; location: string; maxCapacity: number; isLocked?: boolean };
type SeatState = "unregistered" | "empty" | "occupied" | "full" | "locked";

const BLOCKS = ["A", "B", "C", "D"];
const SEATS = Array.from({ length: 10 }, (_, i) => i + 1);

// "A-01", "a1", "A 1" → "A1"; non-matching locations return null
function seatKey(loc: string): string | null {
  const m = loc.trim().toUpperCase().match(/^([A-Z])[\s\-_./]*0*(\d+)$/);
  return m ? `${m[1]}${m[2]}` : null;
}
const canonical = (block: string, n: number) => `${block}-${String(n).padStart(2, "0")}`;

// Figma "Bin locations · Selection": Available = outlined primary, Occupied = grey
const AVAILABLE_BORDER = "color-mix(in srgb, var(--primary) 45%, transparent)";
const OCCUPIED_BG = "color-mix(in srgb, var(--muted) 12%, var(--card))";
const SEAT_STYLE: Record<SeatState, React.CSSProperties> = {
  unregistered: { background: "transparent", borderColor: "var(--border)", borderStyle: "dashed", color: "var(--muted)" },
  empty:        { background: "var(--card)", borderColor: AVAILABLE_BORDER, color: "var(--primary)" },
  occupied:     { background: OCCUPIED_BG, borderColor: "var(--border)", color: "var(--muted)" },
  full:         { background: OCCUPIED_BG, borderColor: "var(--bad-fg)", color: "var(--bad-fg)" },
  locked:       { background: OCCUPIED_BG, borderColor: "var(--border)", color: "var(--muted)", opacity: 0.6 },
};

function BinCard({ label, state, dimmed, alert, parts, qty, capacity, onClick }: {
  label: string; state: SeatState; dimmed: boolean; alert: boolean;
  parts: number; qty: number; capacity: number; onClick: () => void;
}) {
  const sub = state === "unregistered" ? "Not registered"
    : state === "locked" ? "Locked"
    : qty <= 0 ? "Empty"
    : `${parts} part${parts === 1 ? "" : "s"} · ${qty.toLocaleString()}${capacity > 0 ? `/${capacity.toLocaleString()}` : ""} pcs`;
  return (
    <button type="button" onClick={onClick}
      className="relative h-[84px] border rounded-md p-2 flex flex-col items-center justify-center gap-[3px] transition-colors hover:brightness-95"
      style={{ ...SEAT_STYLE[state], ...(alert ? { borderColor: "var(--bad-fg)", borderWidth: 2 } : {}), ...(dimmed ? { opacity: 0.25 } : {}) }}>
      {alert && <span title="AS400 qty ≠ bins total" className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full" style={{ background: "var(--bad-fg)" }} />}
      <Archive className="text-lg" />
      <span className="text-xs font-bold" style={{ textDecoration: state === "locked" ? "line-through" : undefined }}>{label}</span>
      <span className="text-[10px] truncate max-w-full" style={{ color: "var(--muted)" }}>{sub}</span>
    </button>
  );
}

function LegendItem({ state, label }: { state: SeatState; label: string }) {
  return (
    <span className="flex items-center gap-[5px]">
      <span className="inline-block w-3 h-3 border rounded-[3px]" style={SEAT_STYLE[state]} />
      {label}
    </span>
  );
}

export default function BinClient({ initialRows }: { initialRows?: BinRow[] }) {
  const { t } = useLang();
  const router = useRouter();
  const [search, setSearch, searchRef] = useSearchRef();
  const [rows, setRows] = useState<BinRow[]>(initialRows ?? []);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ok" | "error">(
    initialRows ? "ok" : "idle"
  );
  const [error, setError] = useState("");
  const [bins, setBins] = useState<BinConfig[]>([]);
  const [shelf, setShelf] = useState(BLOCKS[0]);

  const loadBins = useCallback(async () => {
    try { setBins(await api.listBinConfigs()); } catch {}
  }, []);

  const load = useCallback(async () => {
    setLoadState("loading");
    try {
      const data = await api.searchStock(searchRef.current.trim() || undefined);
      setRows(data);
      setLoadState("ok");
    } catch (e: any) {
      setError(e.message);
      setLoadState("error");
    }
  }, []);

  const didInit = useRef(false);
  useEffect(() => {
    loadBins();
    if (!didInit.current && initialRows) { didInit.current = true; return; }
    didInit.current = true;
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const binByKey = useMemo(() => {
    const m = new Map<string, BinConfig>();
    for (const b of bins) { const k = seatKey(b.location); if (k) m.set(k, b); }
    return m;
  }, [bins]);

  const rowsByKey = useMemo(() => {
    const m = new Map<string, BinRow[]>();
    for (const r of rows) { const k = seatKey(r.location); if (k) m.set(k, [...(m.get(k) ?? []), r]); }
    return m;
  }, [rows]);

  const seatInfo = (key: string) => {
    const bin = binByKey.get(key);
    const items = rowsByKey.get(key) ?? [];
    const qty = items.reduce((n, r) => n + (r.quantity || 0), 0);
    let state: SeatState = "unregistered";
    if (bin?.isLocked) state = "locked";
    else if (bin) state = qty <= 0 ? "empty" : bin.maxCapacity > 0 && qty >= bin.maxCapacity ? "full" : "occupied";
    return { bin, items, qty, state };
  };

  const searching = search.trim() !== "";
  const occupiedCount = BLOCKS.flatMap((b) => SEATS.map((n) => seatInfo(`${b}${n}`).state))
    .filter((s) => s === "occupied" || s === "full").length;

  return (
    <AppShell title={t.bin.title} active="bin" onRefresh={() => { loadBins(); load(); }}>
      <div className="max-w-6xl mx-auto">

        {/* Search bar */}
        <div className="sticky top-16 z-10 -mx-4 lg:-mx-8 px-4 lg:px-8 pt-3 pb-2 border-b mb-4"
          style={{ background: "var(--header)", borderColor: "var(--border)" }}>
          <div className="relative max-w-2xl mx-auto">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--muted)" }}>
              <Search className="text-lg" />
            </span>
            <input className="field pl-10 pr-10 h-11" placeholder={t.bin.searchPh}
              value={search}
              onChange={(e) => {
                const v = e.target.value;
                setSearch(v);
                if (v === "") { searchRef.current = ""; load(); }
              }}
              onKeyDown={(e) => e.key === "Enter" && load()} />
            {/* ponytail: scanners type + Enter like a keyboard, so the scan button just runs the search */}
            <button type="button" onClick={load} aria-label={t.common.search}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5" style={{ color: "var(--primary)" }}>
              <Scan className="text-xl" />
            </button>
          </div>
        </div>

        {/* Rack map — search dims bins without a match; click opens /bin/[location] */}
        <div className="max-w-2xl mx-auto mb-4 flex flex-col gap-4">
          <div className="grid grid-cols-4 gap-2" role="tablist" aria-label="Rack">
            {BLOCKS.map((b) => {
              const active = b === shelf;
              const hit = searching && SEATS.some((n) => rowsByKey.has(`${b}${n}`));
              return (
                <button key={b} type="button" role="tab" aria-selected={active}
                  onClick={() => setShelf(b)}
                  className="relative h-[34px] rounded-md border text-xs font-semibold transition-colors"
                  style={active
                    ? { background: "var(--primary)", borderColor: "var(--primary)", color: "#fff" }
                    : { background: "var(--card)", borderColor: "var(--border)", color: "var(--muted)" }}>
                  {b}
                  {hit && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full" style={{ background: "var(--ok-fg)" }} />}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">Rack locations</h3>
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                {occupiedCount} / {BLOCKS.length * SEATS.length} occupied
              </span>
            </div>
            <div className="flex flex-wrap gap-x-[18px] gap-y-1 text-[11px]" style={{ color: "var(--muted)" }}>
              <LegendItem state="empty" label="Available" />
              <LegendItem state="occupied" label="Occupied" />
              <LegendItem state="full" label="Full" />
              <LegendItem state="unregistered" label="Not registered" />
              <span className="flex items-center gap-[5px]">
                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: "var(--bad-fg)" }} />
                AS400 qty ≠ bins
              </span>
            </div>
            <div className="rounded px-2.5 py-[5px] text-[11px] font-semibold"
              style={{ background: "var(--primary-tint)", color: "var(--muted)" }}>
              RACK {shelf}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {SEATS.map((n) => {
                const key = `${shelf}${n}`;
                const { bin, items, qty, state } = seatInfo(key);
                const loc = bin?.location ?? canonical(shelf, n);
                return (
                  <BinCard key={key} label={canonical(shelf, n)} state={state}
                    dimmed={searching && items.length === 0}
                    alert={items.some((r) => r.mismatch)}
                    parts={items.length} qty={qty} capacity={bin?.maxCapacity ?? 0}
                    onClick={() => router.push(`/bin/${encodeURIComponent(loc)}`)} />
                );
              })}
            </div>
          </div>
        </div>

        {loadState === "loading" && <Info>{t.common.loading}</Info>}
        {loadState === "error" && <Info bad>{error}</Info>}
      </div>
    </AppShell>
  );
}
