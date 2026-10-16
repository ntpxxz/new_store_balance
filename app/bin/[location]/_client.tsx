"use client";

// Figma "Bin detail" + "Assign part to bin" / "Remove parts from bin" (mode toggles in place)
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import { Archive, Box, Circle, Scan, Plus, Minus, X } from "@/app/components/icons";
import { api, type BinDetail } from "@/lib/client";
import { Info } from "@/app/components/table";
import { useLang } from "@/lib/lang";

type Mode = "view" | "add" | "remove";
type Row = BinDetail["rows"][number];
type LFn = (en: string, th: string) => string;

const fmt = (n: number) => n.toLocaleString();

export default function BinDetailClient({ location, initialData }: { location: string; initialData: BinDetail }) {
  const router = useRouter();
  const { lang } = useLang();
  const L: LFn = (en, th) => (lang === "th" ? th : en);
  const [data, setData] = useState<BinDetail | null>(initialData);
  const [state, setState] = useState<"loading" | "ok" | "error">("ok");
  const [error, setError] = useState("");
  const [mode, setMode] = useState<Mode>("view");
  const [removePart, setRemovePart] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; bad?: boolean } | null>(null);

  const load = useCallback(async () => {
    try { setData(await api.getBin(location)); setState("ok"); }
    catch (e: any) { setError(e.message); setState("error"); }
  }, [location]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), toast.bad ? 5000 : 2500);
    return () => clearTimeout(id);
  }, [toast]);

  const bin = data?.bin ?? null;
  const rows = data?.rows ?? [];
  const total = rows.reduce((n, r) => n + r.quantity, 0);
  const mismatches = rows.filter((r) => r.as400Qty !== r.binsQty).length;
  const status = !bin ? [L("Not registered", "ยังไม่ลงทะเบียน"), "var(--muted)", "var(--border)"]
    : bin.isLocked ? [L("Locked", "ล็อก"), "var(--bad-fg)", "var(--bad-bg)"]
    : [L("Active", "ใช้งาน"), "var(--ok-fg)", "var(--ok-bg)"];
  const last = rows.find((r) => r.latestUpdateDate);
  const cap = bin?.maxCapacity ?? 0;
  const pct = cap > 0 ? Math.min(100, (total / cap) * 100) : 0;

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try { await fn(); setToast({ msg: ok }); }
    catch (e: any) { setToast({ msg: e.message, bad: true }); }
    finally { setBusy(false); }
  }

  const back = () => { setMode("view"); setRemovePart(null); };
  const title = mode === "add" ? L("Add Part to Rack", "เพิ่ม Part เข้า Rack")
    : mode === "remove" ? L("Remove Parts", "นำ Part ออก")
    : L("Rack Details", "รายละเอียด Rack");

  return (
    <AppShell title={title} active="bin" showBack onRefresh={load}>
      <div className="max-w-2xl mx-auto flex flex-col gap-4 pb-8">
        {state === "loading" && <Info>{L("Loading…", "กำลังโหลด…")}</Info>}
        {state === "error" && <Info bad>{error}</Info>}

        {state === "ok" && (
          <>
            {/* Bin summary */}
            <div className="card p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-lg font-bold" style={{ color: "var(--primary)" }}>
                  <Archive className="text-[22px]" /> RACK {location}
                </span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ color: status[1], background: status[2] }}>
                  {status[0]}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat label={L("Parts", "รายการ")} value={fmt(rows.length)} />
                <Stat label={L("Total pcs", "รวม (ชิ้น)")} value={fmt(total)} accent />
                <Stat label={L("Capacity", "ความจุ")} value={cap > 0 ? fmt(cap) : "—"} />
              </div>
              {cap > 0 && (
                <div className="flex items-center gap-2">
                  <span className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                    <span className="block h-full rounded-full"
                      style={{ width: `${pct}%`, background: pct >= 100 ? "var(--bad-fg)" : pct >= 80 ? "var(--warn-fg)" : "var(--primary)" }} />
                  </span>
                  <span className="text-[11px] tabular-nums" style={{ color: "var(--muted)" }}>{Math.round(pct)}%</span>
                </div>
              )}
              {mismatches > 0 && mode === "view" && (
                <p className="text-[11px] font-semibold rounded-md px-2.5 py-1.5" style={{ background: "var(--bad-bg)", color: "var(--bad-fg)" }}>
                  ⚠ {L(`${mismatches} part${mismatches === 1 ? "" : "s"}: AS400 qty ≠ total across racks`, `${mismatches} รายการ ยอด AS400 ไม่ตรงกับยอดรวมทุก rack`)}
                </p>
              )}
            </div>

            {/* Add / remove toggle, with a way back to the detail view */}
            {mode !== "view" && (
              <div className="flex items-center gap-2">
                <div className="flex-1 grid grid-cols-2 gap-1 h-10 p-[3px] rounded-lg" style={{ background: "var(--border)" }}>
                  {(["add", "remove"] as const).map((m) => (
                    <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m}
                      className={`rounded-md text-[13px] ${mode === m ? "font-bold shadow-sm" : ""}`}
                      style={mode === m ? { background: "var(--card)", color: "var(--primary)" } : { color: "var(--muted)" }}>
                      {m === "add" ? L("Add parts", "เพิ่ม Part") : L("Remove parts", "นำ Part ออก")}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={back} aria-label={L("Cancel", "ยกเลิก")}
                  className="h-10 w-10 shrink-0 rounded-lg border flex items-center justify-center"
                  style={{ borderColor: "var(--border)", color: "var(--muted)", background: "var(--card)" }}>
                  <X className="text-lg" />
                </button>
              </div>
            )}

            {mode === "view" && (
              <>
                {!bin && (
                  <div className="card p-4 flex flex-col gap-3 text-center">
                    <p className="text-sm" style={{ color: "var(--muted)" }}>
                      {L(`${location} isn't registered yet. Register it to assign parts.`, `${location} ยังไม่ได้ลงทะเบียน ลงทะเบียนก่อนจึงจะเพิ่ม Part ได้`)}
                    </p>
                    <button type="button" disabled={busy} className="btn btn-primary"
                      onClick={() => run(async () => { await api.addBinConfig(location); await load(); }, L(`${location} registered`, `ลงทะเบียน ${location} แล้ว`))}>
                      {L(`Register ${location}`, `ลงทะเบียน ${location}`)}
                    </button>
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold">{L("Assigned parts", "Part ใน Rack")} ({rows.length})</h3>
                    {bin && rows.length > 0 && (
                      <span className="text-xs" style={{ color: "var(--muted)" }}>{L("Tap a part to remove", "แตะ Part เพื่อนำออก")}</span>
                    )}
                  </div>
                  {rows.length === 0 && (
                    <div className="card p-8 flex flex-col items-center gap-2 text-sm" style={{ color: "var(--muted)" }}>
                      <Box className="text-3xl" />
                      {L("No parts in this rack yet", "ยังไม่มี Part ใน Rack นี้")}
                    </div>
                  )}
                  {rows.map((r) => (
                    <PartCard key={r.id} icon={<Box className="text-2xl" />} partNo={r.partNo} partName={r.partName}
                      qty={`${fmt(r.quantity)} pcs`}
                      warn={r.as400Qty !== r.binsQty
                        ? `AS400 ${fmt(r.as400Qty)} ≠ ${L("all racks", "ทุก rack")} ${fmt(r.binsQty)} (${r.binsQty > r.as400Qty ? "+" : ""}${fmt(r.binsQty - r.as400Qty)})`
                        : undefined}
                      onClick={bin ? () => { setRemovePart(r.partNo); setMode("remove"); } : undefined} />
                  ))}
                  {last && (
                    <p className="text-[11px]" style={{ color: "var(--muted)" }}>
                      {L("Last updated", "อัปเดตล่าสุด")} {last.latestUpdateDate}{last.latestOperatorName ? ` · ${last.latestOperatorName}` : ""}
                    </p>
                  )}
                </div>

                {bin?.isLocked && <Info>{L("This rack is locked — parts can be removed but not added.", "Rack นี้ถูกล็อก นำออกได้ แต่เพิ่มไม่ได้")}</Info>}

                {bin && (
                  <FooterBar>
                    {rows.length > 0 && (
                      <button type="button" className="btn btn-ghost flex-1 h-11" onClick={() => setMode("remove")}>
                        <Minus className="text-lg" /> {L("Remove", "นำออก")}
                      </button>
                    )}
                    {!bin.isLocked && (
                      <button type="button" className="btn btn-primary flex-1 h-11" onClick={() => setMode("add")}>
                        <Plus className="text-lg" /> {L("Add Part", "เพิ่ม Part")}
                      </button>
                    )}
                  </FooterBar>
                )}

                {/* destructive action kept out of the main flow */}
                {bin && (
                  <button type="button" disabled={busy}
                    onClick={() => confirm(L(`Unregister rack "${location}"? Its stock rows stay in place.`, `ยกเลิกการลงทะเบียน "${location}"? ข้อมูลสต็อกยังอยู่`)) &&
                      run(async () => { await api.deleteBinConfig(location); router.push("/bin"); }, L("Rack unregistered", "ยกเลิกการลงทะเบียนแล้ว"))}
                    className="self-center text-xs font-medium underline underline-offset-2 disabled:opacity-50 py-2"
                    style={{ color: "var(--bad-fg)" }}>
                    {L("Unregister this rack", "ยกเลิกการลงทะเบียน Rack นี้")}
                  </button>
                )}
              </>
            )}

            {mode === "add" && bin && (
              <AddPanel L={L} location={location} rows={rows} total={total} busy={busy}
                onSubmit={(partNo, qty) => run(async () => {
                  await api.moveBinStock(location, { action: "add", partNo, qty });
                  await load(); back();
                }, L(`Added ${fmt(qty)} pcs of ${partNo}`, `เพิ่ม ${partNo} ${fmt(qty)} ชิ้นแล้ว`))} />
            )}

            {mode === "remove" && bin && (
              <RemovePanel L={L} location={location} rows={rows} busy={busy} initial={removePart}
                onSubmit={(partNo, qty) => run(async () => {
                  await api.moveBinStock(location, { action: "remove", partNo, qty });
                  await load(); back();
                }, L(`Removed ${fmt(qty)} pcs of ${partNo}`, `นำ ${partNo} ออก ${fmt(qty)} ชิ้นแล้ว`))} />
            )}
          </>
        )}
      </div>

      {toast && (
        <div role="status" className="fixed z-50 left-4 right-4 bottom-24 lg:bottom-6 lg:left-auto lg:right-6 lg:w-80 rounded-xl px-4 py-3 text-sm font-medium shadow-lg"
          style={toast.bad ? { background: "var(--bad-bg)", color: "var(--bad-fg)" } : { background: "var(--ok-bg)", color: "var(--ok-fg)" }}>
          {toast.msg}
        </div>
      )}
    </AppShell>
  );
}

function AddPanel({ L, location, rows, total, busy, onSubmit }: {
  L: LFn; location: string; rows: Row[]; total: number; busy: boolean; onSubmit: (partNo: string, qty: number) => void;
}) {
  const [search, setSearch] = useState("");
  const [cands, setCands] = useState<BinDetail["candidates"] | null>(null);
  const [pick, setPick] = useState<BinDetail["candidates"][number] | null>(null);
  const [qty, setQty] = useState(0);
  const [err, setErr] = useState("");
  const [finding, setFinding] = useState(false);

  async function find() {
    if (!search.trim()) return;
    setErr(""); setFinding(true); setPick(null);
    try {
      const c = (await api.getBin(location, search.trim())).candidates;
      setCands(c);
      // exact scan → select straight away
      const exact = c.find((x) => x.partNo.toUpperCase() === search.trim().toUpperCase()) ?? (c.length === 1 ? c[0] : null);
      if (exact && exact.available > 0) { setPick(exact); setQty(exact.available); }
    } catch (e: any) { setErr(e.message); }
    finally { setFinding(false); }
  }

  const isNew = pick && !rows.some((r) => r.partNo === pick.partNo);
  return (
    <>
      <Section title={L("Select part", "เลือก Part")} hint={L("Search or scan a part", "ค้นหาหรือสแกน Part")}>
        <div className="relative">
          <input className="field pr-10 h-11" placeholder="Part no." autoFocus enterKeyHint="search" value={search}
            onChange={(e) => { setSearch(e.target.value); setCands(null); }} onKeyDown={(e) => e.key === "Enter" && find()} />
          <button type="button" onClick={find} aria-label={L("Search part", "ค้นหา Part")} disabled={finding}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5" style={{ color: "var(--primary)" }}>
            {finding
              ? <span className="block w-5 h-5 rounded-full border-2 border-current border-t-transparent animate-spin" />
              : <Scan className="text-xl" />}
          </button>
        </div>
        {err && <Info bad>{err}</Info>}
        {cands?.length === 0 && <Info>{L(`No part matches "${search}"`, `ไม่พบ Part "${search}"`)}</Info>}
        {cands?.map((c) => {
          const none = c.available <= 0;
          return (
            <PartCard key={c.partNo} selected={pick?.partNo === c.partNo} disabled={none} partNo={c.partNo} partName={c.partName}
              qty={none ? L("All stock already in racks", "สต็อกอยู่ใน rack ครบแล้ว") : L(`${fmt(c.available)} pcs available`, `ว่าง ${fmt(c.available)} ชิ้น`)}
              note={L("Unassigned", "ยังไม่อยู่ใน rack")}
              onClick={none ? undefined : () => { setPick(c); setQty(c.available); }} />
          );
        })}
      </Section>

      {pick && (
        <>
          <Section title={L("Quantity to assign", "จำนวนที่จะเพิ่ม")} hint={L(`Max. ${fmt(pick.available)} pcs`, `สูงสุด ${fmt(pick.available)} ชิ้น`)}>
            <Stepper L={L} value={qty} max={pick.available} onChange={setQty} />
            <p className="text-[11px]" style={{ color: "var(--muted)" }}>
              {L(`${fmt(pick.available - qty)} pcs (AS400 stock not yet in any rack) will remain unassigned.`,
                `อีก ${fmt(pick.available - qty)} ชิ้น (สต็อก AS400 ที่ยังไม่อยู่ใน rack) จะยังไม่ถูกจัดเก็บ`)}
            </p>
          </Section>
          <Preview>
            <p className="text-xs font-semibold" style={{ color: "var(--muted)" }}>{L("AFTER ASSIGNMENT", "หลังเพิ่ม")}</p>
            <div className="flex justify-between text-[13px]">
              <span style={{ color: "var(--muted)" }}>RACK {location} · {rows.length + (isNew ? 1 : 0)} {L("parts", "รายการ")}</span>
              <strong style={{ color: "var(--primary)" }}>{fmt(total + qty)} pcs</strong>
            </div>
          </Preview>
          <FooterBar>
            <button type="button" className="btn btn-primary flex-1 h-11 text-base" disabled={busy || qty <= 0} onClick={() => onSubmit(pick.partNo, qty)}>
              {busy ? L("Saving…", "กำลังบันทึก…") : L(`Add ${fmt(qty)} pcs to rack`, `เพิ่ม ${fmt(qty)} ชิ้นเข้า rack`)}
            </button>
          </FooterBar>
        </>
      )}
    </>
  );
}

function RemovePanel({ L, location, rows, busy, initial, onSubmit }: {
  L: LFn; location: string; rows: Row[]; busy: boolean; initial: string | null; onSubmit: (partNo: string, qty: number) => void;
}) {
  const [pickNo, setPickNo] = useState(initial ?? (rows.length === 1 ? rows[0].partNo : null));
  const pick = rows.find((p) => p.partNo === pickNo) ?? null;
  const [qty, setQty] = useState(pick?.quantity ?? 0);
  const all = pick ? qty === pick.quantity : false;

  if (rows.length === 0) return <Info>{L("No parts in this rack to remove", "ไม่มี Part ให้นำออก")}</Info>;
  return (
    <>
      <Section title={L("Part to remove", "Part ที่จะนำออก")} hint={pick ? L("Tap to change part", "แตะเพื่อเปลี่ยน Part") : L("Select a part", "เลือก Part")}>
        {rows.filter((p) => !pick || p.partNo === pick.partNo).map((p) => (
          <PartCard key={p.partNo} selected={pick?.partNo === p.partNo} partNo={p.partNo} partName={p.partName}
            qty={L(`${fmt(p.quantity)} pcs in this rack`, `${fmt(p.quantity)} ชิ้นใน rack นี้`)}
            onClick={() => {
              if (pick) { setPickNo(null); return; }
              setPickNo(p.partNo); setQty(p.quantity);
            }} />
        ))}
      </Section>

      {pick && (
        <>
          <Section title={L("Quantity to remove", "จำนวนที่จะนำออก")} hint={L(`Max. ${fmt(pick.quantity)} pcs`, `สูงสุด ${fmt(pick.quantity)} ชิ้น`)}>
            <Stepper L={L} value={qty} max={pick.quantity} onChange={setQty} />
            <label className="flex items-center gap-2 text-xs py-1" style={{ color: "var(--muted)" }}>
              <input type="checkbox" className="w-[18px] h-[18px]" checked={all}
                onChange={(e) => setQty(e.target.checked ? pick.quantity : 0)} />
              {L(`Remove all ${fmt(pick.quantity)} pcs and unassign part`, `นำออกทั้งหมด ${fmt(pick.quantity)} ชิ้น และเอา Part ออกจาก rack`)}
            </label>
          </Section>
          <Preview>
            <div className="flex justify-between">
              <span className="text-[13px]" style={{ color: "var(--muted)" }}>{L(`Remaining in RACK ${location}`, `คงเหลือใน RACK ${location}`)}</span>
              <strong className="text-sm" style={{ color: "var(--primary)" }}>{fmt(pick.quantity - qty)} pcs</strong>
            </div>
            <p className="text-xs leading-snug" style={{ color: "var(--muted)" }}>
              {L(`${fmt(qty)} pcs taken off this rack. AS400 stock is not affected.`, `นำออก ${fmt(qty)} ชิ้นจาก rack นี้ สต็อก AS400 ไม่เปลี่ยน`)}
            </p>
          </Preview>
          <FooterBar>
            <button type="button" className="btn flex-1 h-11 text-base text-white" style={{ background: "var(--bad-fg)" }}
              disabled={busy || qty <= 0} onClick={() => onSubmit(pick.partNo, qty)}>
              {busy ? L("Saving…", "กำลังบันทึก…") : L(`Confirm removal · ${fmt(qty)} pcs`, `ยืนยันนำออก · ${fmt(qty)} ชิ้น`)}
            </button>
          </FooterBar>
        </>
      )}
    </>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg py-2" style={{ background: "var(--table-head)" }}>
      <div className="text-base font-bold tabular-nums" style={{ color: accent ? "var(--primary)" : "var(--text)" }}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>{label}</div>
    </div>
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

function PartCard({ partNo, partName, qty, note, warn, icon, selected, disabled, onClick }: {
  partNo: string; partName: string | null; qty: string; note?: string; warn?: string;
  icon?: React.ReactNode; selected?: boolean; disabled?: boolean; onClick?: () => void;
}) {
  return (
    <div role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined} onClick={onClick} aria-pressed={onClick ? !!selected : undefined}
      onKeyDown={(e) => onClick && (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onClick())}
      className={`card p-3 flex items-center gap-2.5 transition ${onClick ? "cursor-pointer active:scale-[.99] hover:brightness-[.98]" : ""}`}
      style={{
        ...(selected ? { borderWidth: 2, borderColor: "var(--primary)" }
          : warn ? { borderWidth: 2, borderColor: "var(--bad-fg)", background: "var(--bad-bg)" } : {}),
        ...(disabled ? { opacity: 0.5 } : {}),
      }}>
      <span className="shrink-0" style={{ color: "var(--primary)" }}>
        {icon ?? (selected
          ? <Circle className="text-xl" />
          : <span className="block w-5 h-5 rounded-full border-2" style={{ borderColor: "var(--border)" }} />)}
      </span>
      <div className="flex-1 min-w-0 flex flex-col gap-1 text-xs">
        <Link href={`/parts?search=${encodeURIComponent(partNo)}`} onClick={(e) => e.stopPropagation()}
          className="font-bold hover:underline w-fit">{partNo}</Link>
        <span className="truncate" style={{ color: "var(--muted)" }}>{partName || "—"}</span>
        <div className="flex justify-between gap-2">
          <span className="font-semibold" style={{ color: "var(--primary)" }}>{qty}</span>
          {note && <span className="text-[11px]" style={{ color: "var(--muted)" }}>{note}</span>}
        </div>
        {warn && <span className="text-[11px] font-semibold" style={{ color: "var(--bad-fg)" }}>⚠ {warn}</span>}
      </div>
    </div>
  );
}

function Stepper({ L, value, max, onChange }: { L: LFn; value: number; max: number; onChange: (n: number) => void }) {
  const set = (n: number) => onChange(Math.max(0, Math.min(max, Number.isFinite(n) ? Math.floor(n) : 0)));
  const btn = "w-11 h-11 rounded-lg flex items-center justify-center disabled:opacity-30";
  return (
    <div className="flex flex-col gap-2">
      <div className="card h-14 px-1.5 flex items-center justify-between" style={{ borderColor: "var(--primary)" }}>
        <button type="button" aria-label="Decrease" className={btn} disabled={value <= 0} onClick={() => set(value - 1)} style={{ color: "var(--primary)" }}>
          <Minus className="text-xl" />
        </button>
        <span className="flex items-baseline gap-1">
          <input type="number" inputMode="numeric" min={0} max={max} value={value}
            onChange={(e) => set(Number(e.target.value))} onFocus={(e) => e.target.select()}
            className="w-24 text-center text-2xl font-bold tabular-nums bg-transparent outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            aria-label="Quantity" />
          <span className="text-[13px]" style={{ color: "var(--muted)" }}>pcs</span>
        </span>
        <button type="button" aria-label="Increase" className={btn} disabled={value >= max} onClick={() => set(value + 1)} style={{ color: "var(--primary)" }}>
          <Plus className="text-xl" />
        </button>
      </div>
      {/* quick picks — typing exact counts on a phone is slow */}
      <div className="flex gap-2">
        {[{ label: "−10", n: value - 10 }, { label: "+10", n: value + 10 }, { label: L("Half", "ครึ่ง"), n: Math.floor(max / 2) }, { label: L("Max", "ทั้งหมด"), n: max }].map((q) => (
          <button key={q.label} type="button" onClick={() => set(q.n)}
            className="flex-1 h-8 rounded-md border text-xs font-medium"
            style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--text)" }}>
            {q.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Preview({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg p-3 flex flex-col gap-2" style={{ background: "var(--primary-tint)" }}>{children}</div>;
}

// Sticky action bar, like the Figma "Page actions" bar — sits above the mobile bottom nav
function FooterBar({ children }: { children: React.ReactNode }) {
  return <div className="sticky bottom-24 lg:bottom-4 mt-2 flex gap-2 z-10">{children}</div>;
}
