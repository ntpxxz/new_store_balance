"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "@/app/components/AppShell";
import { Search, Db, ChevronRight } from "@/app/components/icons";
import { statusBadge, fmtDate } from "@/app/components/InvoiceCard";
import { api, type Task } from "@/lib/client";
import { useSearchRef } from "@/lib/hooks";
import { Th, Td, Info } from "@/app/components/table";
import { useLang } from "@/lib/lang";

function statusColor(status: string) {
  if (status === "COMPLETED") return "#16a34a";
  if (status === "REJECTED") return "#dc2626";
  if (status === "IQC_WAITING" || status === "IQC_IN_PROGRESS") return "#d97706";
  if (status === "ARRIVED") return "#2563eb";
  return "#9ca3af";
}

export default function TrackClient({ initialTasks }: { initialTasks?: Task[] }) {
  const router = useRouter();
  const { t } = useLang();
  const [filter, setFilter] = useState("all");
  const [search, setSearch, searchRef] = useSearchRef();
  const [tasks, setTasks] = useState<Task[]>(initialTasks ?? []);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ok" | "error">(initialTasks ? "ok" : "idle");
  const [error, setError] = useState("");

  const STATUS_FILTERS = [
    { key: "all", label: t.track.filterAll },
    { key: "pending", label: t.track.filterPending },
    { key: "iqc", label: t.track.filterIqc },
    { key: "completed", label: t.track.filterDone },
  ];

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

  const didInit = useRef(false);
  useEffect(() => {
    if (!didInit.current && initialTasks) { didInit.current = true; return; }
    didInit.current = true;
    load(filter);
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AppShell title={t.track.title} active="track" onRefresh={() => load()}>
      <div className="max-w-6xl mx-auto">

        {/* Sticky search + filter bar */}
        <div className="sticky top-16 z-10 -mx-4 lg:-mx-8 px-4 lg:px-8 pt-3 pb-2 border-b"
          style={{ background: "var(--header)", borderColor: "var(--border)" }}>
          <div className="lg:flex lg:items-center lg:justify-between gap-4 max-w-6xl mx-auto">
            <div className="relative lg:flex-1 lg:max-w-md mb-3 lg:mb-0">
              <input className="field pr-9" placeholder={t.track.searchPh}
                value={search}
                onChange={(e) => {
                  const v = e.target.value;
                  setSearch(v);
                  if (v === "") { searchRef.current = ""; load(); }
                }}
                onKeyDown={(e) => e.key === "Enter" && load()} />
              <button type="button" onClick={() => load()} aria-label={t.common.search}
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
          {loadState === "loading" && <Info>{t.common.loading}</Info>}
          {loadState === "error" && <Info bad>{error}</Info>}
          {loadState === "ok" && tasks.length === 0 && <Info>{t.track.noTasks}</Info>}

          {loadState === "ok" && tasks.length > 0 && (
            <>
              <p className="text-xs mb-3 font-medium text-right" style={{ color: "var(--muted)" }}>
                {t.common.items(tasks.length)}
              </p>

              {/* Mobile: card list */}
              <div className="lg:hidden flex flex-col gap-2">
                {tasks.map((tk) => {
                  const badge = statusBadge(tk);
                  return (
                    <Link key={tk.id} href={`/receive/${tk.id}`}
                      className="card p-4 flex items-start gap-3">
                      <div className="w-1 self-stretch rounded-full shrink-0 mt-1"
                        style={{ background: statusColor(tk.status), minHeight: "2rem" }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm" style={{ color: "var(--primary)" }}>{tk.invoiceNo}</span>
                          <span className={`badge ${badge.cls}`}>{badge.label}</span>
                        </div>
                        <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                          {tk.partNo} · {tk.partName} · {tk.vendor}
                        </div>
                        <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                          {t.track.qty} <strong>{tk.planQty}</strong>
                          {tk.receivedAt && <> · {t.track.rcv} {fmtDate(tk.receivedAt)}</>}
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
                  <thead style={{ background: "var(--table-head)" }}>
                    <tr className="text-left" style={{ color: "var(--muted)" }}>
                      <Th>{t.track.colStatus}</Th>
                      <Th>{t.track.colInvoice}</Th>
                      <Th>{t.track.colPartNo}</Th>
                      <Th>{t.track.colPartName}</Th>
                      <Th>{t.track.colVendor}</Th>
                      <Th className="text-right">{t.track.colPlan}</Th>
                      <Th className="text-right">{t.track.colActual}</Th>
                      <Th>{t.track.colInvDate}</Th>
                      <Th>{t.track.colReceived}</Th>
                      <Th className="pr-6" />
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((tk) => {
                      const badge = statusBadge(tk);
                      return (
                        <tr key={tk.id}
                          className="border-t hover:bg-[#f7f9fc] cursor-pointer"
                          style={{ borderColor: "var(--border)" }}
                          onClick={() => router.push(`/receive/${tk.id}`)}>
                          <Td>
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full shrink-0"
                                style={{ background: statusColor(tk.status) }} />
                              <span className={`badge ${badge.cls}`}>{badge.label}</span>
                            </div>
                          </Td>
                          <Td>
                            <Link href={`/receive/${tk.id}`}
                              className="flex items-center gap-1.5 font-semibold"
                              style={{ color: "var(--primary)" }}>
                              <Db /> {tk.invoiceNo}
                            </Link>
                          </Td>
                          <Td>{tk.partNo}</Td>
                          <Td style={{ color: "var(--muted)" }}>{tk.partName || "—"}</Td>
                          <Td style={{ color: "var(--primary)" }}>{tk.vendor}</Td>
                          <Td className="text-right font-bold" style={{ color: "var(--primary)" }}>{tk.planQty}</Td>
                          <Td className="text-right" style={{ color: tk.actualQty ? "inherit" : "var(--muted)" }}>
                            {tk.actualQty || "—"}
                          </Td>
                          <Td style={{ color: "var(--muted)" }}>{fmtDate(tk.invoiceDate, tk.createdAt)}</Td>
                          <Td style={{ color: "var(--muted)" }}>{tk.receivedAt ? fmtDate(tk.receivedAt) : "—"}</Td>
                          <Td className="pr-6">
                            <Link href={`/receive/${tk.id}`}
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
