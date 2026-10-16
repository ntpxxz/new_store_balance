"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import { Scan, Archive, X } from "@/app/components/icons";
import { api, type BinRow } from "@/lib/client";
import { useSearchRef } from "@/lib/hooks";
import { Info } from "@/app/components/table";
import { useLang } from "@/lib/lang";

type BinConfig = { id: string; location: string; maxCapacity: number; isLocked?: boolean };
type SeatState = "unregistered" | "empty" | "occupied" | "full" | "locked";
type LFn = (en: string, th: string) => string;

const BLOCKS = ["A", "B", "C", "D"];
const SEATS = Array.from({ length: 10 }, (_, i) => i + 1);
const SHELF_KEY = "bin.shelf";

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

function BinCard({ label, state, dimmed, alert, parts, qty, capacity, L, onClick }: {
  label: string; state: SeatState; dimmed: boolean; alert: boolean;
  parts: number; qty: number; capacity: number; L: LFn; onClick: () => void;
}) {
  const sub = state === "unregistered" ? L("Not registered", "ยังไม่ลงทะเบียน")
    : state === "locked" ? L("Locked", "ล็อก")
    : qty <= 0 ? L("Empty", "ว่าง")
    : L(`${parts} part${parts === 1 ? "" : "s"}`, `${parts} รายการ`);
  const pct = capacity > 0 ? Math.min(100, (qty / capacity) * 100) : 0;
  return (
    <button type="button" onClick={onClick}
      aria-label={`${label}: ${sub}${qty > 0 ? `, ${qty} pcs` : ""}${alert ? ", AS400 mismatch" : ""}`}
      className="relative h-[92px] border rounded-lg p-2 flex flex-col items-center justify-center gap-[3px] transition active:scale-[.97] hover:brightness-95"
      style={{ ...SEAT_STYLE[state], ...(alert ? { borderColor: "var(--bad-fg)", borderWidth: 2 } : {}), ...(dimmed ? { opacity: 0.25 } : {}) }}>
      {alert && <span title="AS400 qty ≠ bins total" className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full" style={{ background: "var(--bad-fg)" }} />}
      <Archive className="text-lg" />
      <span className="text-xs font-bold" style={{ textDecoration: state === "locked" ? "line-through" : undefined }}>{label}</span>
      <span className="text-[10px] truncate max-w-full" style={{ color: "var(--muted)" }}>{sub}</span>
      {qty > 0 && (
        <span className="text-[10px] font-semibold tabular-nums" style={{ color: state === "full" ? "var(--bad-fg)" : "var(--text)" }}>
          {qty.toLocaleString()}{capacity > 0 ? `/${capacity.toLocaleString()}` : ""}
        </span>
      )}
      {/* fill bar — only when the bin has a capacity */}
      {capacity > 0 && state !== "unregistered" && (
        <span className="absolute left-2 right-2 bottom-1.5 h-1 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
          <span className="block h-full rounded-full"
            style={{ width: `${pct}%`, background: pct >= 100 ? "var(--bad-fg)" : pct >= 80 ? "var(--warn-fg)" : "var(--primary)" }} />
        </span>
      )}
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

export default function BinClient({ initialRows, initialBins }: { initialRows?: BinRow[]; initialBins?: BinConfig[] }) {
  const { t, lang } = useLang();
  const L: LFn = (en, th) => (lang === "th" ? th : en);
  const router = useRouter();
  const [search, setSearch, searchRef] = useSearchRef();
  const [applied, setApplied] = useState(""); // query the current rows were loaded with — not what's being typed
  const [rows, setRows] = useState<BinRow[]>(initialRows ?? []);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ok" | "error">(
    initialRows ? "ok" : "idle"
  );
  const [error, setError] = useState("");
  const [bins, setBins] = useState<BinConfig[]>(initialBins ?? []);
  const [shelf, setShelfState] = useState(BLOCKS[0]);

  // keep the selected rack when coming back from /bin/[location]
  const setShelf = (b: string) => { setShelfState(b); try { sessionStorage.setItem(SHELF_KEY, b); } catch {} };
  useEffect(() => {
    try { const s = sessionStorage.getItem(SHELF_KEY); if (s && BLOCKS.includes(s)) setShelfState(s); } catch {}
  }, []);

  const loadBins = useCallback(async () => {
    try { setBins(await api.listBinConfigs()); } catch {}
  }, []);

  const load = useCallback(async () => {
    const q = searchRef.current.trim();
    setLoadState("loading");
    try {
      const data = await api.searchStock(q || undefined);
      setRows(data);
      setApplied(q);
      setLoadState("ok");
    } catch (e: any) {
      setError(e.message);
      setLoadState("error");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const didInit = useRef(false);
  useEffect(() => {
    if (!initialBins) loadBins();
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
    for (const r of rows) {
      const k = seatKey(r.location);
      if (k) { const list = m.get(k); if (list) list.push(r); else m.set(k, [r]); }
    }
    return m;
  }, [rows]);

  // all 40 seats + per-rack stats computed once per data change, not on every keystroke
  const { seats, stats } = useMemo(() => {
    const seats = new Map<string, { bin?: BinConfig; items: BinRow[]; qty: number; state: SeatState; alert: boolean }>();
    const stats = BLOCKS.map((b) => {
      let used = 0, alert = false;
      for (const n of SEATS) {
        const key = `${b}${n}`;
        const bin = binByKey.get(key);
        const items = rowsByKey.get(key) ?? [];
        const qty = items.reduce((s, r) => s + (r.quantity || 0), 0);
        let state: SeatState = "unregistered";
        if (bin?.isLocked) state = "locked";
        else if (bin) state = qty <= 0 ? "empty" : bin.maxCapacity > 0 && qty >= bin.maxCapacity ? "full" : "occupied";
        const seatAlert = items.some((r) => r.mismatch);
        seats.set(key, { bin, items, qty, state, alert: seatAlert });
        if (state === "occupied" || state === "full") used++;
        alert ||= seatAlert;
      }
      return { used, alert };
    });
    return { seats, stats };
  }, [binByKey, rowsByKey]);

  const searching = applied !== "";
  const hits = useMemo(
    () => (searching ? BLOCKS.flatMap((b) => SEATS.filter((n) => rowsByKey.has(`${b}${n}`)).map((n) => ({ b, n }))) : []),
    [searching, rowsByKey]
  );

  // after a search, jump to the first rack with a match if the current one has none
  useEffect(() => {
    if (hits.length && !hits.some((h) => h.b === shelf)) setShelf(hits[0].b);
  }, [applied, rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const used = stats.reduce((n, s) => n + s.used, 0);
  const alertRacks = stats.filter((s) => s.alert).length;

  const clear = () => { setSearch(""); searchRef.current = ""; load(); };
  const open = (b: string, n: number) =>
    router.push(`/bin/${encodeURIComponent(binByKey.get(`${b}${n}`)?.location ?? canonical(b, n))}`);

  return (
    <AppShell title={t.bin.title} active="bin" onRefresh={() => { loadBins(); load(); }}>
      <div className="max-w-6xl mx-auto">

        {/* Search bar */}
        <div className="sticky top-16 z-10 -mx-4 lg:-mx-8 px-4 lg:px-8 pt-3 pb-2 border-b mb-4"
          style={{ background: "var(--header)", borderColor: "var(--border)" }}>
          <div className="relative max-w-3xl mx-auto">
            <input className="field pr-[4.5rem] h-11" placeholder={t.bin.searchPh} enterKeyHint="search"
              value={search}
              onChange={(e) => {
                const v = e.target.value;
                setSearch(v);
                if (v === "" && applied) clear();
              }}
              onKeyDown={(e) => e.key === "Enter" && load()} />
            {search && (
              <button type="button" onClick={clear} aria-label={L("Clear", "ล้าง")}
                className="absolute right-10 top-1/2 -translate-y-1/2 p-1" style={{ color: "var(--muted)" }}>
                <X className="text-lg" />
              </button>
            )}
            {/* ponytail: scanners type + Enter like a keyboard, so the scan button just runs the search */}
            <button type="button" onClick={load} aria-label={t.common.search} disabled={loadState === "loading"}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5" style={{ color: "var(--primary)" }}>
              {loadState === "loading"
                ? <span className="block w-5 h-5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                : <Scan className="text-xl" />}
            </button>
          </div>

          {/* search result — tap a bin to open it */}
          {searching && loadState === "ok" && (
            <div className="max-w-3xl mx-auto mt-2 flex items-center gap-2 overflow-x-auto text-xs pb-0.5" aria-live="polite">
              <span className="shrink-0" style={{ color: "var(--muted)" }}>
                {hits.length
                  ? L(`Found in ${hits.length} bin${hits.length === 1 ? "" : "s"}:`, `พบใน ${hits.length} bin:`)
                  : L(`No bin holds "${applied}"`, `ไม่พบ "${applied}" ใน bin ใด`)}
              </span>
              {hits.map(({ b, n }) => (
                <button key={`${b}${n}`} type="button" onClick={() => open(b, n)}
                  className="shrink-0 px-2 py-0.5 rounded-full font-semibold"
                  style={{ background: "var(--ok-bg)", color: "var(--ok-fg)" }}>
                  {canonical(b, n)}
                </button>
              ))}
            </div>
          )}
        </div>

        {loadState === "error" && <div className="max-w-3xl mx-auto mb-4"><Info bad>{error}</Info></div>}

        {/* Rack map — search dims bins without a match; click opens /bin/[location] */}
        <div className="max-w-3xl mx-auto mb-4 flex flex-col gap-4 transition-opacity"
          style={{ opacity: loadState === "loading" ? 0.6 : 1 }}>
          <div className="flex items-end justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold">{L("Rack locations", "ตำแหน่ง Rack")}</h3>
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                {L(`${used} / ${BLOCKS.length * SEATS.length} occupied`, `ใช้งาน ${used} / ${BLOCKS.length * SEATS.length}`)}
              </p>
            </div>
            {alertRacks > 0 && (
              <span className="text-[11px] font-semibold px-2 py-1 rounded-full" style={{ background: "var(--bad-bg)", color: "var(--bad-fg)" }}>
                {L(`${alertRacks} rack${alertRacks === 1 ? "" : "s"} with AS400 mismatch`, `${alertRacks} rack ยอด AS400 ไม่ตรง`)}
              </span>
            )}
          </div>

          <div className="grid grid-cols-4 gap-2" role="tablist" aria-label="Rack">
            {BLOCKS.map((b, i) => {
              const active = b === shelf;
              const hit = hits.some((h) => h.b === b);
              const dot = hit ? "var(--ok-fg)" : stats[i].alert ? "var(--bad-fg)" : null;
              return (
                <button key={b} type="button" role="tab" aria-selected={active}
                  onClick={() => setShelf(b)}
                  className="relative py-1.5 rounded-lg border transition-colors flex flex-col items-center leading-tight"
                  style={active
                    ? { background: "var(--primary)", borderColor: "var(--primary)", color: "#fff" }
                    : { background: "var(--card)", borderColor: "var(--border)", color: "var(--text)" }}>
                  <span className="text-sm font-bold">{b}</span>
                  <span className="text-[10px] tabular-nums" style={{ opacity: 0.75 }}>{stats[i].used}/{SEATS.length}</span>
                  {dot && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full"
                      style={{ background: dot, boxShadow: "0 0 0 2px var(--header)" }} />
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-x-[18px] gap-y-1 text-[11px]" style={{ color: "var(--muted)" }}>
            <LegendItem state="empty" label={L("Available", "ว่าง")} />
            <LegendItem state="occupied" label={L("Occupied", "มีของ")} />
            <LegendItem state="full" label={L("Full", "เต็ม")} />
            <LegendItem state="unregistered" label={L("Not registered", "ยังไม่ลงทะเบียน")} />
            <span className="flex items-center gap-[5px]">
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: "var(--bad-fg)" }} />
              {L("AS400 qty ≠ bins", "ยอด AS400 ≠ bin")}
            </span>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2" role="tabpanel" aria-label={`Rack ${shelf}`}>
            {SEATS.map((n) => {
              const key = `${shelf}${n}`;
              const { bin, items, qty, state, alert } = seats.get(key)!;
              return (
                <BinCard key={key} label={canonical(shelf, n)} state={state} L={L}
                  dimmed={searching && items.length === 0}
                  alert={alert}
                  parts={items.length} qty={qty} capacity={bin?.maxCapacity ?? 0}
                  onClick={() => open(shelf, n)} />
              );
            })}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
