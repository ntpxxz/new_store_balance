"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import { Box } from "@/app/components/icons";
import { api, getToken, type PartDetail } from "@/lib/client";

export default function PartDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [part, setPart] = useState<PartDetail | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    try {
      setPart(await api.getPart(id));
      setState("ok");
    } catch (e: any) {
      setError(e.message);
      setState("error");
    }
  }, [id]);

  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    load();
  }, [load, router]);

  return (
    <AppShell title="Part Detail" active="parts" showBack onRefresh={load}>
      <div className="max-w-4xl mx-auto flex flex-col gap-4">
        {state === "loading" && <Blank>Loading…</Blank>}
        {state === "error" && <Blank bad>{error}</Blank>}
        {state === "ok" && part && <Detail part={part} />}
      </div>
    </AppShell>
  );
}

function Detail({ part }: { part: PartDetail }) {
  const low = part.totalQty <= part.safetyStock;
  return (
    <>
      {/* Header */}
      <div className="card p-5 lg:p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="rounded-2xl p-3.5 text-2xl shrink-0" style={{ background: "var(--primary-tint)", color: "var(--primary)" }}>
              <Box />
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--muted)" }}>
                {part.divisionName ?? part.division ?? "—"}
              </div>
              <div className="text-2xl font-black tracking-tight leading-none" style={{ color: "var(--primary)" }}>{part.partNo}</div>
              <div className="text-sm mt-1.5 leading-snug" style={{ color: "var(--muted)" }}>{part.name ?? "—"}</div>
            </div>
          </div>

          <div className="text-right shrink-0">
            <div className="text-4xl font-black tabular-nums leading-none" style={{ color: low ? "var(--bad-fg)" : "var(--ok-fg)" }}>
              {part.totalQty.toLocaleString()}
            </div>
            <div className="text-xs font-medium mt-1" style={{ color: "var(--muted)" }}>{part.unit} on hand</div>
            <div className="mt-2">
              <span className={`badge ${low ? "badge-bad" : "badge-ok"}`}>
                {low ? "⚠ Below safety" : "✓ OK"} · min {part.safetyStock}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Master info grid */}
      <div className="card p-5 lg:p-6">
        <SectionLabel>Part Information</SectionLabel>
        <dl className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4 mt-3 text-sm">
          <Field label="Part No." value={part.partNo} />
          <Field label="Unit" value={part.unit} />
          <Field label="Safety Stock" value={String(part.safetyStock)} />
          <Field label="Division" value={part.division} />
          <Field label="Division Name" value={part.divisionName} />
          <Field label="Item Type" value={part.itemType} />
          <Field label="Plant (PLAC)" value={part.plac} />
          <Field label="Dept" value={part.dept} />
          <Field label="AC Code" value={part.acCode} />
          {part.spec && <Field label="Spec" value={part.spec} />}
          {part.drawingNo && <Field label="Drawing No." value={part.drawingNo} />}
        </dl>
      </div>

      {/* Stock locations */}
      <div className="card overflow-hidden">
        <div className="px-5 pt-5 pb-3 flex items-center gap-2">
          <SectionLabel>Stock Locations</SectionLabel>
          <span className="badge badge-muted">{part.stocks.length}</span>
        </div>
        {part.stocks.length === 0 ? (
          <p className="px-5 pb-5 text-sm" style={{ color: "var(--muted)" }}>No stock records.</p>
        ) : (
          <>
            {/* Mobile */}
            <div className="lg:hidden flex flex-col divide-y" style={{ borderColor: "var(--border)" }}>
              {part.stocks.map((s) => (
                <div key={s.id} className="px-5 py-4">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <div className="font-semibold text-sm">{s.location}{s.wh ? ` · WH ${s.wh}` : ""}</div>
                      <div className="text-xs mt-1 space-y-0.5" style={{ color: "var(--muted)" }}>
                        {s.vendorName && <div>{s.vendorName}</div>}
                        {s.matlot && <div>Lot: {s.matlot}</div>}
                        {s.latestUpdateDate && <div>Updated: {s.latestUpdateDate}</div>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold text-base tabular-nums" style={{ color: "var(--primary)" }}>{s.quantity.toLocaleString()}</div>
                      <div className="text-[11px]" style={{ color: "var(--muted)" }}>{part.unit}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead style={{ background: "#f7f9fc" }}>
                  <tr style={{ color: "var(--muted)" }}>
                    <Th>Location</Th><Th>WH</Th><Th>Matlot</Th><Th>Vendor</Th>
                    <Th>Std Price</Th><Th>Act Price</Th><Th right>Qty</Th>
                  </tr>
                </thead>
                <tbody>
                  {part.stocks.map((s) => (
                    <tr key={s.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <Td bold>{s.location}</Td>
                      <Td muted>{s.wh ?? "—"}</Td>
                      <Td muted>{s.matlot ?? "—"}</Td>
                      <Td>{s.vendorName ?? s.vendorCode ?? "—"}</Td>
                      <Td muted>{s.stdPrice != null ? s.stdPrice.toLocaleString() : "—"}</Td>
                      <Td muted>{s.actPrice != null ? s.actPrice.toLocaleString() : "—"}</Td>
                      <Td right bold primary>{s.quantity.toLocaleString()}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Movement history */}
      {part.movements.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 pt-5 pb-3 flex items-center gap-2">
            <SectionLabel>Movement History</SectionLabel>
            <span className="badge badge-muted">{part.movements.length}</span>
          </div>
          {/* Desktop */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ background: "#f7f9fc" }}>
                <tr style={{ color: "var(--muted)" }}>
                  <Th>Date</Th><Th>Type</Th><Th>Ref</Th><Th>Location</Th>
                  <Th right>Qty</Th>
                </tr>
              </thead>
              <tbody>
                {part.movements.map((m) => (
                  <tr key={m.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <Td muted>{new Date(m.createdAt).toLocaleDateString()}</Td>
                    <Td><span className={`badge ${movBadge(m.type)}`}>{m.type}</span></Td>
                    <Td muted>{m.docRef ?? "—"}</Td>
                    <Td muted>{m.location ?? "—"}</Td>
                    <Td right bold style={{ color: m.qty >= 0 ? "var(--ok-fg)" : "var(--bad-fg)" }}>
                      {m.qty >= 0 ? "+" : ""}{m.qty}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile */}
          <div className="lg:hidden flex flex-col divide-y" style={{ borderColor: "var(--border)" }}>
            {part.movements.map((m) => (
              <div key={m.id} className="px-5 py-3.5">
                <div className="flex justify-between items-center gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`badge ${movBadge(m.type)}`}>{m.type}</span>
                    {m.docRef && <span className="text-xs font-medium" style={{ color: "var(--muted)" }}>{m.docRef}</span>}
                  </div>
                  <span className="font-bold text-sm tabular-nums" style={{ color: m.qty >= 0 ? "var(--ok-fg)" : "var(--bad-fg)" }}>
                    {m.qty >= 0 ? "+" : ""}{m.qty}
                  </span>
                </div>
                <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                  {new Date(m.createdAt).toLocaleDateString()}{m.location ? ` · ${m.location}` : ""}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent inbound history */}
      {part.inboundTasks.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 pt-5 pb-3">
            <SectionLabel>Recent Inbound</SectionLabel>
          </div>
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ background: "#f7f9fc" }}>
                <tr style={{ color: "var(--muted)" }}>
                  <Th>Invoice</Th><Th>Vendor</Th><Th>Lot</Th><Th>Status</Th>
                  <Th right>Plan</Th><Th right pr>Received</Th>
                </tr>
              </thead>
              <tbody>
                {part.inboundTasks.map((t) => (
                  <tr key={t.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <Td bold primary>{t.invoiceNo}</Td>
                    <Td>{t.vendor}</Td>
                    <Td muted>{t.lotNo ?? "—"}</Td>
                    <Td><span className={`badge ${statusBadge(t.status)}`}>{t.status}</span></Td>
                    <Td right>{t.planQty}</Td>
                    <Td right pr>{t.actualQty ?? "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile inbound */}
          <div className="lg:hidden flex flex-col divide-y" style={{ borderColor: "var(--border)" }}>
            {part.inboundTasks.map((t) => (
              <div key={t.id} className="px-5 py-3.5">
                <div className="flex justify-between items-center gap-2 mb-1">
                  <span className="font-semibold text-sm" style={{ color: "var(--primary)" }}>{t.invoiceNo}</span>
                  <span className={`badge ${statusBadge(t.status)}`}>{t.status}</span>
                </div>
                <div className="text-xs" style={{ color: "var(--muted)" }}>
                  {t.vendor}{t.lotNo ? ` · Lot: ${t.lotNo}` : ""} · Plan {t.planQty} / Got {t.actualQty ?? "—"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function statusBadge(s: string) {
  if (s === "COMPLETED") return "badge-ok";
  if (s === "REJECTED") return "badge-bad";
  if (s.startsWith("IQC")) return "badge-warn";
  return "badge-muted";
}

function movBadge(t: string) {
  if (t === "IN") return "badge-ok";
  if (t === "OUT") return "badge-bad";
  if (t === "ADJUST") return "badge-warn";
  return "badge-muted";
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--muted)" }}>
      {children}
    </div>
  );
}

type ThProps = { children: React.ReactNode; right?: boolean; pr?: boolean };
function Th({ children, right, pr }: ThProps) {
  return (
    <th className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-left ${right ? "text-right" : ""} ${pr ? "pr-6" : ""}`}>
      {children}
    </th>
  );
}

type TdProps = {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  bold?: boolean;
  muted?: boolean;
  primary?: boolean;
  right?: boolean;
  pr?: boolean;
};
function Td({ children, className = "", style, bold, muted, primary, right, pr }: TdProps) {
  const color = primary ? "var(--primary)" : muted ? "var(--muted)" : undefined;
  return (
    <td
      className={`px-4 py-3 ${bold ? "font-semibold" : ""} ${right ? "text-right" : ""} ${pr ? "pr-6" : ""} ${className}`}
      style={{ color, ...style }}
    >
      {children}
    </td>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--muted)" }}>{label}</dt>
      <dd className="text-sm font-semibold truncate">{value || "—"}</dd>
    </div>
  );
}

function Blank({ children, bad }: { children: React.ReactNode; bad?: boolean }) {
  return <div className="card p-8 text-center text-sm" style={{ color: bad ? "var(--bad-fg)" : "var(--muted)" }}>{children}</div>;
}
