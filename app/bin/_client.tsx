"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import AppShell from "@/app/components/AppShell";
import { Search } from "@/app/components/icons";
import { api, type BinRow } from "@/lib/client";
import { useSearchRef } from "@/lib/hooks";
import { Th, Td, Info } from "@/app/components/table";
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

const SEAT_STYLE: Record<SeatState, React.CSSProperties> = {
  unregistered: { background: "transparent", borderColor: "var(--border)", borderStyle: "dashed", color: "var(--muted)" },
  empty:        { background: "var(--card)", borderColor: "var(--muted)", color: "var(--muted)" },
  occupied:     { background: "var(--primary)", borderColor: "var(--primary)", color: "#fff" },
  full:         { background: "var(--bad-fg)", borderColor: "var(--bad-fg)", color: "#fff" },
  locked:       { background: "var(--border)", borderColor: "var(--border)", color: "var(--muted)" },
};
const SELECTED_STYLE: React.CSSProperties = { background: "var(--ok-fg)", borderColor: "var(--ok-fg)", color: "#fff" };

function Seat({ label, state, selected, dimmed, title, onClick }: {
  label: string; state: SeatState; selected: boolean; dimmed: boolean; title: string; onClick: () => void;
}) {
  return (
    <button type="button" title={title} aria-label={title} aria-pressed={selected} onClick={onClick}
      className="relative shrink-0 w-9 h-9 sm:w-10 sm:h-10 border-2 rounded-t-xl rounded-b-md text-xs font-semibold transition-all hover:-translate-y-0.5"
      style={{
        ...SEAT_STYLE[state],
        ...(selected ? SELECTED_STYLE : {}),
        opacity: dimmed ? 0.25 : 1,
        boxShadow: selected ? "0 0 0 3px var(--ok-bg)" : undefined,
        textDecoration: state === "locked" ? "line-through" : undefined,
      }}>
      {label}
      {/* seat cushion */}
      <span className="absolute -bottom-1 left-1 right-1 h-1 rounded-full" style={{ background: "currentColor", opacity: 0.35 }} />
    </button>
  );
}

function LegendItem({ state, label }: { state: SeatState | "selected"; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block w-4 h-4 border-2 rounded-t-md rounded-b-sm"
        style={state === "selected" ? SELECTED_STYLE : SEAT_STYLE[state]} />
      {label}
    </span>
  );
}

export default function BinClient({ initialRows }: { initialRows?: BinRow[] }) {
  const { t } = useLang();
  const [search, setSearch, searchRef] = useSearchRef();
  const [rows, setRows] = useState<BinRow[]>(initialRows ?? []);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ok" | "error">(
    initialRows ? "ok" : "idle"
  );
  const [error, setError] = useState("");
  const [bins, setBins] = useState<BinConfig[]>([]);
  const [selected, setSelected] = useState<string | null>(null); // seat key, e.g. "A1"
  const [binBusy, setBinBusy] = useState(false);

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

  const registerBin = useCallback(async (loc: string) => {
    setBinBusy(true);
    try { await api.addBinConfig(loc); await loadBins(); load(); }
    catch (e: any) { setError(e.message); }
    finally { setBinBusy(false); }
  }, [loadBins, load]);

  const removeBin = useCallback(async (loc: string) => {
    if (!confirm(`Remove bin "${loc}"?`)) return;
    setBinBusy(true);
    try { await api.deleteBinConfig(loc); await loadBins(); load(); }
    catch (e: any) { setError(e.message); }
    finally { setBinBusy(false); }
  }, [loadBins, load]);

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
  const sel = selected ? { key: selected, ...seatInfo(selected) } : null;
  const visibleRows = sel ? sel.items : rows;
  const selLabel = sel ? sel.bin?.location ?? canonical(sel.key[0], Number(sel.key.slice(1))) : "";
  const occupiedCount = BLOCKS.flatMap((b) => SEATS.map((n) => seatInfo(`${b}${n}`).state))
    .filter((s) => s === "occupied" || s === "full").length;

  return (
    <AppShell title={t.bin.title} active="bin" onRefresh={load}>
      <div className="max-w-6xl mx-auto">

        {/* Search bar */}
        <div className="sticky top-16 z-10 -mx-4 lg:-mx-8 px-4 lg:px-8 pt-3 pb-2 border-b mb-4"
          style={{ background: "var(--header)", borderColor: "var(--border)" }}>
          <div className="relative flex-1 max-w-md">
            <input className="field pr-9" placeholder={t.bin.searchPh}
              value={search}
              onChange={(e) => {
                const v = e.target.value;
                setSearch(v);
                if (v === "") { searchRef.current = ""; load(); }
              }}
              onKeyDown={(e) => e.key === "Enter" && load()} />
            <button type="button" onClick={load} aria-label={t.common.search}
              className="absolute right-2.5 top-2 p-0.5" style={{ color: "var(--muted)" }}>
              <Search className="text-lg" />
            </button>
          </div>
        </div>

        {/* Seat map */}
        <div className="card p-4 sm:p-6 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold">Bin Map</h3>
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              {occupiedCount} / {BLOCKS.length * SEATS.length} occupied
            </span>
          </div>

          {/* "Screen" */}
          <div className="mx-auto mb-8 max-w-2xl">
            <div className="h-1.5 rounded-[50%]" style={{ background: "var(--primary)", boxShadow: "0 10px 24px var(--primary)", opacity: 0.6 }} />
            <p className="text-center text-[10px] tracking-[0.4em] mt-3" style={{ color: "var(--muted)" }}>ENTRANCE</p>
          </div>

          <div className="overflow-x-auto pb-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6 w-max mx-auto">
              {BLOCKS.map((block) => (
                <div key={block}>
                  <p className="text-xs font-bold mb-2 text-center" style={{ color: "var(--muted)" }}>Block {block}</p>
                  <div className="flex items-center gap-2">
                    <span className="w-4 text-xs font-bold text-right" style={{ color: "var(--muted)" }}>{block}</span>
                    <div className="flex gap-1.5">
                      {SEATS.map((n) => {
                        const key = `${block}${n}`;
                        const { bin, items, qty, state } = seatInfo(key);
                        const title = bin
                          ? `${bin.location} · ${items.length} part(s) · qty ${qty}${bin.maxCapacity > 0 ? ` / ${bin.maxCapacity}` : ""}`
                          : `${canonical(block, n)} · not registered`;
                        return (
                          <Seat key={key} label={String(n)} state={state}
                            selected={selected === key}
                            dimmed={searching && items.length === 0}
                            title={title}
                            onClick={() => setSelected(selected === key ? null : key)} />
                        );
                      })}
                    </div>
                    <span className="w-4 text-xs font-bold" style={{ color: "var(--muted)" }}>{block}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-4 mt-6 text-xs" style={{ color: "var(--muted)" }}>
            <LegendItem state="unregistered" label="Not registered" />
            <LegendItem state="empty" label="Empty" />
            <LegendItem state="occupied" label="Occupied" />
            <LegendItem state="full" label="Full" />
            <LegendItem state="locked" label="Locked" />
            <LegendItem state="selected" label="Selected" />
          </div>
        </div>

        {sel && (
          <div className="card p-3 mb-3 flex items-center justify-between gap-2 flex-wrap">
            <p className="text-sm">
              <strong style={{ color: "var(--primary)" }}>{selLabel}</strong>
              <span style={{ color: "var(--muted)" }}>
                {sel.bin ? ` · ${t.common.items(sel.items.length)} · qty ${sel.qty}` : " · not registered"}
              </span>
            </p>
            <div className="flex gap-2">
              <button type="button" className="btn btn-ghost" onClick={() => setSelected(null)}>Show all</button>
              {sel.bin ? (
                <button type="button" className="btn btn-warn" disabled={binBusy}
                  onClick={async () => { await removeBin(sel.bin!.location); }}>
                  Remove bin
                </button>
              ) : (
                <button type="button" className="btn btn-primary" disabled={binBusy}
                  onClick={() => registerBin(selLabel)}>
                  Register {selLabel}
                </button>
              )}
            </div>
          </div>
        )}

        {loadState === "loading" && <Info>{t.common.loading}</Info>}
        {loadState === "error" && <Info bad>{error}</Info>}
        {loadState === "ok" && visibleRows.length === 0 && <Info>{t.bin.noRows}</Info>}

        {loadState === "ok" && visibleRows.length > 0 && (
          <>
            {!sel && (
              <p className="text-xs mb-3 font-medium" style={{ color: "var(--muted)" }}>
                {t.common.items(rows.length)}
              </p>
            )}

            {/* Mobile cards */}
            <div className="lg:hidden flex flex-col gap-2">
              {visibleRows.map((r) => (
                <div key={r.id} className="card p-4">
                  <div className="flex items-center justify-between mb-1">
                    <Link href={`/parts?search=${encodeURIComponent(r.partNo)}`}
                      className="font-semibold text-sm" style={{ color: "var(--primary)" }}>
                      {r.partNo}
                    </Link>
                    <span className="font-bold text-base" style={{ color: r.quantity > 0 ? "var(--primary)" : "var(--muted)" }}>
                      {r.quantity}
                    </span>
                  </div>
                  <div className="text-sm">{r.partName || "—"}</div>
                  <div className="text-xs mt-1 flex gap-3 flex-wrap" style={{ color: "var(--muted)" }}>
                    <span>{t.bin.colLocation}: <strong style={{ color: "inherit" }}>{r.location}</strong></span>
                    {r.wh && <span>WH: {r.wh}</span>}
                    {r.stcl && <span>STCL: {r.stcl}</span>}
                    {r.as400Location && <span>AS400: {r.as400Location}</span>}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden lg:block card overflow-hidden">
              <table className="w-full text-sm">
                <thead style={{ background: "var(--table-head)" }}>
                  <tr className="text-left" style={{ color: "var(--muted)" }}>
                    <Th>{t.bin.colLocation}</Th>
                    <Th>WH</Th>
                    <Th>STCL</Th>
                    <Th>{t.bin.colPartNo}</Th>
                    <Th>{t.bin.colPartName}</Th>
                    <Th>{t.bin.colVendor}</Th>
                    <Th className="text-right">{t.bin.colQty}</Th>
                    <Th>{t.bin.colUpdated}</Th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((r) => (
                    <tr key={r.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <Td><strong style={{ color: "var(--primary)" }}>{r.location}</strong></Td>
                      <Td style={{ color: "var(--muted)" }}>{r.wh || "—"}</Td>
                      <Td style={{ color: "var(--muted)" }}>{r.stcl || "—"}</Td>
                      <Td>
                        <Link href={`/parts?search=${encodeURIComponent(r.partNo)}`}
                          className="font-semibold hover:underline" style={{ color: "var(--primary)" }}>
                          {r.partNo}
                        </Link>
                      </Td>
                      <Td style={{ color: "var(--muted)" }}>{r.partName || "—"}</Td>
                      <Td style={{ color: "var(--muted)" }}>{r.vendorName || "—"}</Td>
                      <Td className="text-right font-bold text-base"
                        style={{ color: r.quantity > 0 ? "var(--primary)" : "var(--muted)" }}>
                        {r.quantity}
                      </Td>
                      <Td style={{ color: "var(--muted)" }}>{r.latestUpdateDate || r.lastStockIn || "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
