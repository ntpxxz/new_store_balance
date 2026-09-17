"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "@/app/components/AppShell";
import { Search, Db, ChevronRight } from "@/app/components/icons";
import { statusBadge, fmtDate } from "@/app/components/InvoiceCard";
import { api, type Task } from "@/lib/client";
import { useAuthRedirect, useSearchRef } from "@/lib/hooks";
import { Th, Td, Info } from "@/app/components/table";

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending / Arrived" },
  { key: "iqc", label: "IQC" },
  { key: "completed", label: "Done" },
];

// Colour strip on the left of each row by status group
function statusColor(status: string) {
  if (status === "COMPLETED") return "#16a34a";
  if (status === "REJECTED") return "#dc2626";
  if (status === "IQC_WAITING" || status === "IQC_IN_PROGRESS") return "#d97706";
  if (status === "ARRIVED") return "#2563eb";
  return "#9ca3af"; // PENDING / CANCELLED
}

export default function TrackPage() {
  const router = useRouter();
  const [filter, setFilter] = useState("all");
  const [search, setSearch, searchRef] = useSearchRef();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [error, setError] = useState("");

  useAuthRedirect();

  const load = useCallback(async (f = filter) => {
    setLoadState("loading");
    try {
      const data = await api.listTasks(f, searchRef.current.trim() || undefined);
      setTasks(data);
      setLoadState("ok");
    } catch (e: any) {
      setError(e.message);
      setLoadState("error");
    }
  }, [filter]);

  useEffect(() => { load(filter); }, [filter]);

  // Count per status for the filter buttons
  const countByFilter = (key: string) => {
    if (!tasks.length || key === "all") return null;
    // just show total when filtered
    return null;
  };

  return (
    <AppShell title="Warehouse Tracker" active="track" onRefresh={() => load()}>
      <div className="max-w-6xl mx-auto">

        {/* Sticky search + filter bar */}
        <div className="sticky top-16 z-10 -mx-4 lg:-mx-8 px-4 lg:px-8 pt-3 pb-2 border-b"
          style={{ background: "var(--header)", borderColor: "var(--border)" }}>
          <div className="lg:flex lg:items-center lg:justify-between gap-4 max-w-6xl mx-auto">
            <div className="relative lg:flex-1 lg:max-w-md mb-3 lg:mb-0">
              <input className="field pr-9" placeholder="Search invoice, part, vendor…"
                value={search}
                onChange={(e) => {
                  const v = e.target.value;
                  setSearch(v);
                  if (v === "") { searchRef.current = ""; load(); }
                }}
                onKeyDown={(e) => e.key === "Enter" && load()} />
              <button type="button" onClick={() => load()} aria-label="Search"
                className="absolute right-2.5 top-2 p-0.5" style={{ color: "var(--muted)" }}>
                <Search className="text-lg" />
              </button>
            </div>
            <div className="seg">
              {STATUS_FILTERS.map((f) => (
                <button key={f.key} data-active={filter === f.key} onClick={() => setFilter(f.key)}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4">
          {loadState === "loading" && <Info>Loading…</Info>}
          {loadState === "error" && <Info bad>{error}</Info>}
          {loadState === "ok" && tasks.length === 0 && <Info>No tasks found.</Info>}

          {loadState === "ok" && tasks.length > 0 && (
            <>
              <p className="text-xs mb-3 font-medium text-right" style={{ color: "var(--muted)" }}>
                {tasks.length} item{tasks.length !== 1 ? "s" : ""}
              </p>

              {/* Mobile: card list */}
              <div className="lg:hidden flex flex-col gap-2">
                {tasks.map((t) => {
                  const badge = statusBadge(t);
                  return (
                    <Link key={t.id} href={`/receive/${t.id}`}
                      className="card p-4 flex items-start gap-3">
                      <div className="w-1 self-stretch rounded-full shrink-0 mt-1"
                        style={{ background: statusColor(t.status), minHeight: "2rem" }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm" style={{ color: "var(--primary)" }}>{t.invoiceNo}</span>
                          <span className={`badge ${badge.cls}`}>{badge.label}</span>
                        </div>
                        <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                          {t.partNo} · {t.partName} · {t.vendor}
                        </div>
                        <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                          Qty: <strong>{t.planQty}</strong>
                          {t.receivedAt && <> · Rcv: {fmtDate(t.receivedAt)}</>}
                        </div>
                      </div>
                      <ChevronRight className="text-lg shrink-0 mt-1" style={{ color: "var(--muted)" }} />
                    </Link>
                  );
                })}
              </div>

              {/* Desktop table */}
              <div className="hidden lg:block card overflow-hidden">
                <table className="w-full text-sm">
                  <thead style={{ background: "#f7f9fc" }}>
                    <tr className="text-left" style={{ color: "var(--muted)" }}>
                      <Th>Status</Th>
                      <Th>Invoice</Th>
                      <Th>Part No.</Th>
                      <Th>Part Name</Th>
                      <Th>Vendor</Th>
                      <Th className="text-right">Plan Qty</Th>
                      <Th className="text-right">Actual</Th>
                      <Th>Invoice Date</Th>
                      <Th>Received</Th>
                      <Th className="pr-6" />
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((t) => {
                      const badge = statusBadge(t);
                      return (
                        <tr key={t.id}
                          className="border-t hover:bg-[#f7f9fc] cursor-pointer"
                          style={{ borderColor: "var(--border)" }}
                          onClick={() => router.push(`/receive/${t.id}`)}>
                          <Td>
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full shrink-0"
                                style={{ background: statusColor(t.status) }} />
                              <span className={`badge ${badge.cls}`}>{badge.label}</span>
                            </div>
                          </Td>
                          <Td>
                            <Link href={`/receive/${t.id}`}
                              className="flex items-center gap-1.5 font-semibold"
                              style={{ color: "var(--primary)" }}>
                              <Db /> {t.invoiceNo}
                            </Link>
                          </Td>
                          <Td>{t.partNo}</Td>
                          <Td style={{ color: "var(--muted)" }}>{t.partName || "—"}</Td>
                          <Td style={{ color: "var(--primary)" }}>{t.vendor}</Td>
                          <Td className="text-right font-bold" style={{ color: "var(--primary)" }}>{t.planQty}</Td>
                          <Td className="text-right" style={{ color: t.actualQty ? "inherit" : "var(--muted)" }}>
                            {t.actualQty || "—"}
                          </Td>
                          <Td style={{ color: "var(--muted)" }}>{fmtDate(t.invoiceDate, t.createdAt)}</Td>
                          <Td style={{ color: "var(--muted)" }}>{t.receivedAt ? fmtDate(t.receivedAt) : "—"}</Td>
                          <Td className="pr-6">
                            <Link href={`/receive/${t.id}`}
                              className="inline-flex items-center gap-1"
                              style={{ color: "var(--muted)" }}>
                              <ChevronRight />
                            </Link>
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
