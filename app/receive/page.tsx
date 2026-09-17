"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "@/app/components/AppShell";
import { Search, Db, ChevronRight } from "@/app/components/icons";
import InvoiceCard, { iqcResult, statusBadge, fmtDate } from "@/app/components/InvoiceCard";
import { api, type Task } from "@/lib/client";
import { useAuthRedirect, useSearchRef } from "@/lib/hooks";
import { Th, Td, Info } from "@/app/components/table";

export { iqcResult, fmtDate };

const TABS = [
  { key: "pending", label: "Pending" },
  { key: "iqc", label: "IQC" },
  { key: "completed", label: "Done" },
];

export default function ReceiveListPage() {
  const router = useRouter();
  const [tab, setTab] = useState("pending");
  const [search, setSearch, searchRef] = useSearchRef();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncInfo, setSyncInfo] = useState<{ dbCount: number; sourceDuplicates: number } | null>(null);
  const syncAbortRef = useRef<AbortController | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const todayStr = () => new Date().toISOString().slice(0, 10);
  const [syncFrom, setSyncFrom] = useState(todayStr);
  const [syncTo, setSyncTo] = useState(todayStr);

  const loadCounts = useCallback(async () => {
    try {
      const c = await api.getCounts();
      setCounts(c);
    } catch {}
  }, []);

  const load = useCallback(async (currentTab = tab) => {
    setLoadState("loading");
    try {
      const data = await api.listTasks(currentTab, searchRef.current.trim() || undefined);
      setTasks(data);
      setLoadState("ok");
    } catch (e: any) {
      setError(e.message);
      setLoadState("error");
    }
  }, [tab]);

  const handleSync = useCallback(() => {
    const ctrl = new AbortController();
    syncAbortRef.current = ctrl;
    setSyncing(true);
    setSyncInfo(null);
    api.sync({ dateFrom: syncFrom, dateTo: syncTo, signal: ctrl.signal })
      .then((r) => setSyncInfo({ dbCount: r.dbCount, sourceDuplicates: r.sourceDuplicates }))
      .catch(() => {})
      .finally(() => {
        syncAbortRef.current = null;
        setSyncing(false);
        load();
        loadCounts();
      });
  }, [load, syncFrom, syncTo]);

  const handleCancelSync = useCallback(() => {
    syncAbortRef.current?.abort();
  }, []);

  useAuthRedirect();
  // On tab change auto-load list (no PBASS sync on browser refresh)
  useEffect(() => {
    load(tab);
    loadCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]); // intentional: search is manual (Enter), sync is manual button

  return (
    <AppShell title="Receive" active="receive" onRefresh={() => load()} onSync={handleSync} syncBusy={syncing}>
      {syncing && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4"
          style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }}>
          <div className="w-12 h-12 rounded-full border-4 border-white border-t-transparent animate-spin" />
          <p className="text-white font-semibold text-lg tracking-wide">Syncing from PBASS…</p>
          <p className="text-white/60 text-sm">
            {syncFrom === syncTo ? syncFrom : `${syncFrom} — ${syncTo}`}
          </p>
          <button onClick={handleCancelSync}
            className="mt-2 px-5 py-2 rounded-lg text-sm font-medium"
            style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)" }}>
            Cancel
          </button>
        </div>
      )}
      <div className="max-w-6xl mx-auto">

        {/* Sticky search + tabs bar */}
        <div className="sticky top-16 z-10 -mx-4 lg:-mx-8 px-4 lg:px-8 pt-3 pb-2 border-b"
          style={{ background: "var(--header)", borderColor: "var(--border)" }}>
          <div className="lg:flex lg:items-center lg:justify-between gap-4 max-w-6xl mx-auto">
            <div className="relative lg:flex-1 lg:max-w-md mb-3 lg:mb-0">
              <input className="field pr-9" placeholder="Search invoice or vendor…"
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
            <div className="seg lg:w-80">
              {TABS.map((t) => (
                <button key={t.key} data-active={tab === t.key} onClick={() => setTab(t.key)}>
                  {t.label}
                  {counts[t.key] != null && (
                    <span className="ml-1.5 inline-flex items-center justify-center rounded-full text-[10px] font-bold tabular-nums"
                      style={{ minWidth: "1.25rem", height: "1.25rem", padding: "0 4px",
                        background: tab === t.key ? "var(--accent)" : "var(--border)",
                        color: tab === t.key ? "#fff" : "var(--muted)" }}>
                      {counts[t.key]}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
          {/* Sync date range */}
          <div className="flex items-center gap-2 mt-2 text-xs" style={{ color: "var(--muted)" }}>
            <span>Sync range:</span>
            <input type="date" className="field py-1 text-xs" style={{ width: "9rem" }} value={syncFrom} onChange={e => setSyncFrom(e.target.value)} />
            <span>—</span>
            <input type="date" className="field py-1 text-xs" style={{ width: "9rem" }} value={syncTo} onChange={e => setSyncTo(e.target.value)} />
          </div>

          {/* Sync result line */}
          {syncInfo && !syncing && (
            <p className="mt-1.5 text-xs" style={{ color: "var(--muted)" }}>
              Found <strong>{syncInfo.dbCount}</strong> invoice(s) in DB
              {syncInfo.sourceDuplicates > 0 && <> · {syncInfo.sourceDuplicates} PBASS duplicate(s) merged</>}
            </p>
          )}
        </div>

        <div className="mt-4">
          {loadState === "loading" && <Info>Loading…</Info>}
          {loadState === "error" && <Info bad>{error}</Info>}
          {loadState === "ok" && tasks.length === 0 && (
            <Info>{tab === "pending" ? "No pending items — press ↻ sync to load invoices from PBASS." : "No items in this tab."}</Info>
          )}

          {loadState === "ok" && tasks.length > 0 && (
            <>
              {/* count chip */}
              <p className="text-xs mb-3 font-medium text-right" style={{ color: "var(--muted)" }}>
                {tasks.length} item{tasks.length !== 1 ? "s" : ""}
              </p>

              {/* Mobile cards */}
              <div className="lg:hidden flex flex-col gap-3">
                {tasks.map((t) => <InvoiceCard key={t.id} task={t} href={`/receive/${t.id}`} showViewDetail />)}
              </div>

              {/* Desktop table */}
              <div className="hidden lg:block card overflow-hidden">
                <table className="w-full text-sm">
                  <thead style={{ background: "#f7f9fc" }}>
                    <tr className="text-left" style={{ color: "var(--muted)" }}>
                      <Th>Inbound ID</Th><Th>Part No.</Th><Th>Part Name</Th><Th>Vendor Code</Th><Th>PO Number</Th>
                      <Th>{tab === "completed" ? "Invoice / Received" : "Date"}</Th><Th className="text-right">Qty</Th><Th className="text-right pr-6">Actions</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((t) => (
                      <tr key={t.id} className="border-t hover:bg-[#f7f9fc] cursor-pointer" style={{ borderColor: "var(--border)" }}
                        onClick={() => router.push(`/receive/${t.id}`)}>
                        <Td>
                          <Link href={`/receive/${t.id}`} className="flex items-center gap-2 font-semibold" style={{ color: "var(--primary)" }}>
                            <Db /> {t.invoiceNo}
                          </Link>
                          <div className="mt-1">
                            <span className={`badge ${statusBadge(t).cls}`}>{statusBadge(t).label}</span>
                          </div>
                        </Td>
                        <Td>{t.partNo}</Td>
                        <Td style={{ color: "var(--muted)" }}>{t.partName || "—"}</Td>
                        <Td style={{ color: "var(--primary)" }}>{t.vendor}</Td>
                        <Td style={{ color: "var(--muted)" }}>{t.poNo || "—"}</Td>
                        <Td>
                          <div>{fmtDate(t.invoiceDate, t.createdAt)}</div>
                          {t.receivedAt && (
                            <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                              Rcv: {fmtDate(t.receivedAt)}
                            </div>
                          )}
                        </Td>
                        <Td className="text-right font-bold text-base" style={{ color: "var(--primary)" }}>{t.planQty}</Td>
                        <Td className="text-right pr-6">
                          <Link href={`/receive/${t.id}`} className="inline-flex items-center gap-1" style={{ color: "var(--muted)" }}>
                            view detail <ChevronRight />
                          </Link>
                        </Td>
                      </tr>
                    ))}
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

