"use client";

// Figma "Bin detail" + "Assign part to bin" / "Remove parts from bin" (mode toggles in place)
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import { Archive, Box, Circle, Search, Scan, Plus, Minus } from "@/app/components/icons";
import { api, type BinDetail } from "@/lib/client";
import { useAuthRedirect } from "@/lib/hooks";
import { Info } from "@/app/components/table";

type Mode = "view" | "add" | "remove";
type Row = BinDetail["rows"][number];

const fmt = (n: number) => n.toLocaleString();

export default function BinDetailPage() {
  const location = decodeURIComponent(useParams<{ location: string }>().location);
  const router = useRouter();
  const [data, setData] = useState<BinDetail | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [error, setError] = useState("");
  const [mode, setMode] = useState<Mode>("view");
  const [removePart, setRemovePart] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setData(await api.getBin(location)); setState("ok"); }
    catch (e: any) { setError(e.message); setState("error"); }
  }, [location]);

  useAuthRedirect();
  useEffect(() => { load(); }, [load]);

  const bin = data?.bin ?? null;
  const rows = data?.rows ?? [];
  const total = rows.reduce((n, r) => n + r.quantity, 0);
  const status = !bin ? ["Not registered", "var(--muted)"] : bin.isLocked ? ["Locked", "var(--bad-fg)"] : ["Active", "var(--ok-fg)"];
  const last = rows.find((r) => r.latestUpdateDate);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await fn(); } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  }

  const title = mode === "add" ? "Add Part to Rack" : mode === "remove" ? "Remove Parts" : "Rack Details";

  return (
    <AppShell title={title} active="bin" showBack onRefresh={load}>
      <div className="max-w-2xl mx-auto flex flex-col gap-4 pb-24">
        {state === "loading" && <Info>Loading…</Info>}
        {state === "error" && <Info bad>{error}</Info>}

        {state === "ok" && (
          <>
            {/* Bin summary */}
            <div className="card p-4 flex flex-col gap-2.5" style={{ borderColor: "var(--muted)" }}>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-lg font-bold" style={{ color: "var(--primary)" }}>
                  <Archive className="text-[22px]" /> RACK {location}
                </span>
                <span className="text-[11px] font-semibold" style={{ color: status[1] }}>{status[0]}</span>
              </div>
              {mode === "view" && (
                <>
                  <hr style={{ borderColor: "var(--border)" }} />
                  <div className="flex justify-between text-[13px]">
                    <span>{rows.length} assigned part{rows.length === 1 ? "" : "s"}</span>
                    <strong style={{ color: "var(--primary)" }}>{fmt(total)} pcs</strong>
                  </div>
                </>
              )}
            </div>

            {mode !== "view" && (
              <div className="grid grid-cols-2 gap-1 h-[38px] p-[3px] rounded-lg" style={{ background: "var(--border)" }}>
                {(["add", "remove"] as const).map((m) => (
                  <button key={m} type="button" onClick={() => setMode(m)}
                    className={`rounded-md text-[13px] ${mode === m ? "font-bold" : ""}`}
                    style={mode === m ? { background: "var(--card)", color: "var(--primary)" } : { color: "var(--muted)" }}>
                    {m === "add" ? "Add parts" : "Remove parts"}
                  </button>
                ))}
              </div>
            )}

            {error && <Info bad>{error}</Info>}

            {mode === "view" && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {bin ? (
                    <button type="button" disabled={busy}
                      onClick={() => confirm(`Remove bin "${location}"? Its stock rows stay in place.`) &&
                        run(async () => { await api.deleteBinConfig(location); router.push("/bin"); })}
                      className="col-span-2 h-[38px] rounded-md border text-xs font-medium disabled:opacity-50"
                      style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--bad-fg)" }}>
                      Remove bin
                    </button>
                  ) : (
                    <button type="button" disabled={busy}
                      onClick={() => run(async () => { await api.addBinConfig(location); await load(); })}
                      className="col-span-2 h-[38px] rounded-md text-xs font-bold text-white disabled:opacity-50"
                      style={{ background: "var(--primary)" }}>
                      Register {location}
                    </button>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold">Assigned parts ({rows.length})</h3>
                    <span className="text-xs" style={{ color: "var(--muted)" }}>Qty in this bin</span>
                  </div>
                  {rows.length === 0 && <Info>No parts in this bin</Info>}
                  {rows.map((r) => (
                    <PartCard key={r.id} icon={<Box className="text-2xl" />} partNo={r.partNo} partName={r.partName}
                      qty={`${fmt(r.quantity)} pcs`}
                      warn={r.as400Qty !== r.binsQty
                        ? `AS400 ${fmt(r.as400Qty)} pcs ≠ all racks ${fmt(r.binsQty)} pcs (${r.binsQty > r.as400Qty ? "+" : ""}${fmt(r.binsQty - r.as400Qty)})`
                        : undefined}
                      onClick={bin ? () => { setRemovePart(r.partNo); setMode("remove"); } : undefined} />
                  ))}
                  {last && (
                    <p className="text-[11px]" style={{ color: "var(--muted)" }}>
                      Last updated {last.latestUpdateDate}{last.latestOperatorName ? ` · ${last.latestOperatorName}` : ""}
                    </p>
                  )}
                </div>

                {bin && !bin.isLocked && (
                  <FooterButton onClick={() => setMode("add")}><Plus className="text-lg" /> Add Part</FooterButton>
                )}
              </>
            )}

            {mode === "add" && bin && (
              <AddPanel location={location} rows={rows} total={total} busy={busy}
                onSubmit={(partNo, qty) => run(async () => {
                  await api.moveBinStock(location, { action: "add", partNo, qty });
                  await load(); setMode("view");
                })} />
            )}

            {mode === "remove" && bin && (
              <RemovePanel location={location} rows={rows} busy={busy} initial={removePart}
                onSubmit={(partNo, qty) => run(async () => {
                  await api.moveBinStock(location, { action: "remove", partNo, qty });
                  await load(); setMode("view"); setRemovePart(null);
                })} />
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

function AddPanel({ location, rows, total, busy, onSubmit }: {
  location: string; rows: Row[]; total: number; busy: boolean; onSubmit: (partNo: string, qty: number) => void;
}) {
  const [search, setSearch] = useState("");
  const [cands, setCands] = useState<BinDetail["candidates"] | null>(null);
  const [pick, setPick] = useState<BinDetail["candidates"][number] | null>(null);
  const [qty, setQty] = useState(0);
  const [err, setErr] = useState("");

  async function find() {
    if (!search.trim()) return;
    setErr("");
    try {
      const c = (await api.getBin(location, search.trim())).candidates;
      setCands(c);
      // exact scan → select straight away
      const exact = c.find((x) => x.partNo.toUpperCase() === search.trim().toUpperCase()) ?? (c.length === 1 ? c[0] : null);
      if (exact) { setPick(exact); setQty(exact.available); }
    } catch (e: any) { setErr(e.message); }
  }

  const isNew = pick && !rows.some((r) => r.partNo === pick.partNo);
  return (
    <>
      <Section title="Select part" hint="Search or scan a part">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--muted)" }}>
            <Search className="text-lg" />
          </span>
          <input className="field pl-10 pr-10 h-11" placeholder="Part no." autoFocus value={search}
            onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && find()} />
          <button type="button" onClick={find} aria-label="Search part"
            className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5" style={{ color: "var(--primary)" }}>
            <Scan className="text-xl" />
          </button>
        </div>
        {err && <Info bad>{err}</Info>}
        {cands?.length === 0 && <Info>No part matches “{search}”</Info>}
        {cands?.map((c) => (
          <PartCard key={c.partNo} selected={pick?.partNo === c.partNo} partNo={c.partNo} partName={c.partName}
            qty={`${fmt(c.available)} pcs available`} note="Unassigned"
            onClick={() => { setPick(c); setQty(c.available); }} />
        ))}
      </Section>

      {pick && (
        <>
          <Section title="Quantity to assign" hint={`Max. ${fmt(pick.available)} pcs`}>
            <Stepper value={qty} max={pick.available} onChange={setQty} />
            <p className="text-[11px]" style={{ color: "var(--muted)" }}>
              {fmt(pick.available - qty)} pcs (AS400 stock not yet in any rack) will remain unassigned.
            </p>
          </Section>
          <Preview>
            <p className="text-xs">AFTER ASSIGNMENT</p>
            <div className="flex justify-between text-[13px]">
              <span style={{ color: "var(--muted)" }}>RACK {location} · {rows.length + (isNew ? 1 : 0)} parts</span>
              <span style={{ color: "var(--primary)" }}>{fmt(total + qty)} pcs</span>
            </div>
          </Preview>
          <FooterButton disabled={busy || qty <= 0} onClick={() => onSubmit(pick.partNo, qty)}>
            Add {fmt(qty)} pcs to rack
          </FooterButton>
        </>
      )}
    </>
  );
}

function RemovePanel({ location, rows, busy, initial, onSubmit }: {
  location: string; rows: Row[]; busy: boolean; initial: string | null; onSubmit: (partNo: string, qty: number) => void;
}) {
  const parts = rows.map((r) => ({ ...r, total: r.quantity })); // one row per part per bin
  const [pickNo, setPickNo] = useState(initial ?? (parts.length === 1 ? parts[0].partNo : null));
  const pick = parts.find((p) => p.partNo === pickNo) ?? null;
  const [qty, setQty] = useState(pick?.total ?? 0);
  const all = pick ? qty === pick.total : false;

  if (parts.length === 0) return <Info>No parts in this bin to remove</Info>;
  return (
    <>
      <Section title="Part to remove" hint={pick ? "Tap to change part" : "Select a part"}>
        {parts.filter((p) => !pick || p.partNo === pick.partNo).map((p) => (
          <PartCard key={p.partNo} selected={pick?.partNo === p.partNo} partNo={p.partNo} partName={p.partName}
            qty={`${fmt(p.total)} pcs in this rack`}
            onClick={() => {
              if (pick) { setPickNo(null); return; }
              setPickNo(p.partNo); setQty(p.total);
            }} />
        ))}
      </Section>

      {pick && (
        <>
          <Section title="Quantity to remove" hint={`Max. ${fmt(pick.total)} pcs`}>
            <Stepper value={qty} max={pick.total} onChange={setQty} />
            <label className="flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
              <input type="checkbox" className="w-[18px] h-[18px]" checked={all}
                onChange={(e) => setQty(e.target.checked ? pick.total : 0)} />
              Remove all {fmt(pick.total)} pcs and unassign part
            </label>
          </Section>
          <Preview>
            <div className="flex justify-between">
              <span className="text-[13px]" style={{ color: "var(--muted)" }}>Remaining in RACK {location}</span>
              <strong className="text-sm" style={{ color: "var(--primary)" }}>{fmt(pick.total - qty)} pcs</strong>
            </div>
            <p className="text-xs leading-snug" style={{ color: "var(--muted)" }}>
              {fmt(qty)} pcs taken off this rack. AS400 stock is not affected.
            </p>
          </Preview>
          <FooterButton disabled={busy || qty <= 0} onClick={() => onSubmit(pick.partNo, qty)}>
            Confirm Removal · {fmt(qty)} pcs
          </FooterButton>
        </>
      )}
    </>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold">{title}</h3>
        {hint && <span className="text-xs" style={{ color: "var(--muted)" }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function PartCard({ partNo, partName, qty, note, warn, icon, selected, onClick }: {
  partNo: string; partName: string | null; qty: string; note?: string; warn?: string;
  icon?: React.ReactNode; selected?: boolean; onClick?: () => void;
}) {
  return (
    <div role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined} onClick={onClick}
      onKeyDown={(e) => onClick && (e.key === "Enter" || e.key === " ") && onClick()}
      className={`card p-3 flex items-center gap-2.5 ${onClick ? "cursor-pointer" : ""}`}
      style={selected ? { borderWidth: 2, borderColor: "var(--primary)" }
        : warn ? { borderWidth: 2, borderColor: "var(--bad-fg)", background: "var(--bad-bg)" } : undefined}>
      <span className="shrink-0" style={{ color: "var(--primary)" }}>
        {icon ?? (selected
          ? <Circle className="text-xl" />
          : <span className="block w-5 h-5 rounded-full border-2" style={{ borderColor: "var(--border)" }} />)}
      </span>
      <div className="flex-1 min-w-0 flex flex-col gap-1 text-xs">
        <Link href={`/parts?search=${encodeURIComponent(partNo)}`} onClick={(e) => e.stopPropagation()}
          className="font-bold hover:underline w-fit">{partNo}</Link>
        <span style={{ color: "var(--muted)" }}>{partName || "—"}</span>
        <div className="flex justify-between">
          <span className="font-semibold" style={{ color: "var(--primary)" }}>{qty}</span>
          {note && <span className="text-[11px]" style={{ color: "var(--muted)" }}>{note}</span>}
        </div>
        {warn && <span className="text-[11px] font-semibold" style={{ color: "var(--bad-fg)" }}>⚠ {warn}</span>}
      </div>
    </div>
  );
}

function Stepper({ value, max, onChange }: { value: number; max: number; onChange: (n: number) => void }) {
  const set = (n: number) => onChange(Math.max(0, Math.min(max, Number.isFinite(n) ? n : 0)));
  return (
    <div className="card h-12 px-4 flex items-center justify-between" style={{ borderColor: "var(--primary)" }}>
      <button type="button" aria-label="Decrease" onClick={() => set(value - 1)} style={{ color: "var(--primary)" }}>
        <Minus className="text-xl" />
      </button>
      <span className="flex items-baseline gap-1">
        <input type="number" inputMode="numeric" min={0} max={max} value={value}
          onChange={(e) => set(Number(e.target.value))}
          className="w-24 text-center text-xl bg-transparent outline-none" aria-label="Quantity" />
        <span className="text-[13px]" style={{ color: "var(--muted)" }}>pcs</span>
      </span>
      <button type="button" aria-label="Increase" onClick={() => set(value + 1)} style={{ color: "var(--primary)" }}>
        <Plus className="text-xl" />
      </button>
    </div>
  );
}

function Preview({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg p-3 flex flex-col gap-2" style={{ background: "var(--primary-tint)" }}>{children}</div>;
}

// Sticky primary action, like the Figma "Page actions" bar
function FooterButton({ children, disabled, onClick }: { children: React.ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <div className="sticky bottom-4 mt-2">
      <button type="button" disabled={disabled} onClick={onClick}
        className="w-full h-11 rounded-lg text-base font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50"
        style={{ background: "var(--primary)" }}>
        {children}
      </button>
    </div>
  );
}
