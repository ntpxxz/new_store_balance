"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "@/app/components/AppShell";
import { Search, Db, ChevronRight, Filter } from "@/app/components/icons";
import InvoiceCard, { iqcResult, statusBadge, fmtDate } from "@/app/components/InvoiceCard";
import { api, type Task } from "@/lib/client";
import { useSearchRef } from "@/lib/hooks";
import { Th, Td, Info } from "@/app/components/table";
import { useLang } from "@/lib/lang";

export { iqcResult, fmtDate };

export default function ReceiveClient({
  initialTasks,
  initialCounts,
}: {
  initialTasks?: Task[];
  initialCounts?: Record<string, number>;
}) {
  const router = useRouter();
  const { t } = useLang();
  const [tab, setTab] = useState("pending");
  const [search, setSearch, searchRef] = useSearchRef();
  const [tasks, setTasks] = useState<Task[]>(initialTasks ?? []);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ok" | "error">(initialTasks ? "ok" : "idle");
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncInfo, setSyncInfo] = useState<{ dbCount: number; sourceDuplicates: number } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncModal, setSyncModal] = useState(false);
  const syncAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!syncModal) return;
    const id = setTimeout(() => setSyncModal(false), 5000);
    return () => clearTimeout(id);
  }, [syncModal]);
  const [counts, setCounts] = useState<Record<string, number>>(initialCounts ?? {});
  const todayStr = () => new Date().toISOString().slice(0, 10);
  const [syncFrom, setSyncFrom] = useState(todayStr);
  const [syncTo, setSyncTo] = useState(todayStr);
  const [filterOpen, setFilterOpen] = useState(false);

  const TABS = [
    { key: "pending", label: t.receive.tabPending },
    { key: "iqc", label: t.receive.tabIqc },
    { key: "completed", label: t.receive.tabDone },
  ];

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
    setSyncError(null);
    api.sync({ dateFrom: syncFrom, dateTo: syncTo, signal: ctrl.signal })
      .then((r) => { setSyncInfo({ dbCount: r.dbCount, sourceDuplicates: r.sourceDuplicates }); setSyncModal(true); })
      .catch((e: any) => { if (e?.name !== 'AbortError') { setSyncError(e.message || 'Sync failed'); setSyncModal(true); } })
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

  // auto-navigate when QR scan resolves to exactly one task
  useEffect(() => {
    if (loadState === "ok" && tasks.length === 1 && /^DO\d+$/i.test(searchRef.current)) {
      router.push(`/receive/${tasks[0].id}`);
    }
  }, [tasks, loadState]); // eslint-disable-line react-hooks/exhaustive-deps

  const didInit = useRef(false);
  useEffect(() => {
    if (!didInit.current && initialTasks) {
      didInit.current = true;
      return; // server pre-fetched pending tab + counts
    }
    didInit.current = true;
    load(tab);
    loadCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  return (
    <AppShell title={t.receive.title} active="receive" onRefresh={() => load()} onSync={handleSync} syncBusy={syncing}>
      {syncing && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4"
          style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }}>
          <div className="w-12 h-12 rounded-full border-4 border-white border-t-transparent animate-spin" />
          <p className="text-white font-semibold text-lg tracking-wide">{t.receive.syncing}</p>
          <p className="text-white/60 text-sm">
            {syncFrom === syncTo ? syncFrom : `${syncFrom} — ${syncTo}`}
          </p>
          <button onClick={handleCancelSync}
            className="mt-2 px-5 py-2 rounded-lg text-sm font-medium"
            style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)" }}>
            {t.common.cancel}
          </button>
        </div>
      )}
      <div className="max-w-6xl mx-auto">

        {/* Sticky search + tabs bar */}
        <div className="sticky top-16 z-10 -mx-4 lg:-mx-8 px-4 lg:px-8 pt-3 pb-2 border-b"
          style={{ background: "var(--header)", borderColor: "var(--border)" }}>
          <div className="lg:flex lg:items-center lg:justify-between gap-4 max-w-6xl mx-auto">
            <div className="flex items-center gap-2 lg:flex-1 lg:max-w-md mb-3 lg:mb-0">
              <div className="relative flex-1">
                <input className="field pr-9" placeholder={t.receive.searchPh}
                  value={search}
                  onChange={(e) => {
                    const v = e.target.value;
                    // ponytail: QR scans embed DO number in long text — extract and auto-search
                    const doMatch = v.match(/DO\d+/i);
                    if (doMatch && v.length > doMatch[0].length) {
                      const doNo = doMatch[0].toUpperCase();
                      searchRef.current = doNo;
                      setSearch(doNo);
                      load();
                      return;
                    }
                    setSearch(v);
                    if (v === "") { searchRef.current = ""; load(); }
                  }}
                  onKeyDown={(e) => e.key === "Enter" && load()} />
                <button type="button" onClick={() => load()} aria-label={t.common.search}
                  className="absolute right-2.5 top-2 p-0.5" style={{ color: "var(--muted)" }}>
                  <Search className="text-lg" />
                </button>
              </div>
              {/* Filter toggle */}
              <button type="button" onClick={() => setFilterOpen(o => !o)} aria-label="Filter"
                className="shrink-0 p-2 rounded-lg border"
                style={{
                  borderColor: filterOpen ? "var(--primary)" : "var(--border)",
                  color: filterOpen ? "var(--primary)" : "var(--muted)",
                  background: filterOpen ? "var(--primary-tint)" : "transparent",
                }}>
                <Filter className="text-lg" />
              </button>
            </div>
            <div className="seg lg:w-80">
              {TABS.map((tb) => (
                <button key={tb.key} data-active={tab === tb.key} onClick={() => setTab(tb.key)}>
                  {tb.label}
                  {counts[tb.key] != null && (
                    <span className="ml-1.5 inline-flex items-center justify-center rounded-full text-[10px] font-bold tabular-nums"
                      style={{ minWidth: "1.25rem", height: "1.25rem", padding: "0 4px",
                        background: tab === tb.key ? "var(--accent)" : "var(--border)",
                        color: tab === tb.key ? "#fff" : "var(--muted)" }}>
                      {counts[tb.key]}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
          {filterOpen && (
            <div className="flex items-center gap-2 mt-2 text-xs" style={{ color: "var(--muted)" }}>
<input type="date" className="field py-1 text-xs flex-1" value={syncFrom} onChange={e => setSyncFrom(e.target.value)} />
              <span>—</span>
              <input type="date" className="field py-1 text-xs flex-1" value={syncTo} onChange={e => setSyncTo(e.target.value)} />
            </div>
          )}

        </div>

        <div className="mt-4">
          {loadState === "loading" && <Info>{t.common.loading}</Info>}
          {loadState === "error" && <Info bad>{error}</Info>}
          {loadState === "ok" && tasks.length === 0 && (
            <Info>{tab === "pending" ? t.receive.noPending : t.receive.noItems}</Info>
          )}

          {loadState === "ok" && tasks.length > 0 && (
            <>
              <p className="text-xs mb-3 font-medium text-right" style={{ color: "var(--muted)" }}>
                {t.common.items(tasks.length)}
              </p>

              {/* Mobile cards */}
              <div className="lg:hidden flex flex-col gap-3">
                {tasks.map((tk) => <InvoiceCard key={tk.id} task={tk} href={`/receive/${tk.id}`} showViewDetail />)}
              </div>

              {/* Desktop table */}
              <div className="hidden lg:block card overflow-hidden">
                <table className="w-full text-sm">
                  <thead style={{ background: "var(--table-head)" }}>
                    <tr className="text-left" style={{ color: "var(--muted)" }}>
                      <Th>{t.receive.colId}</Th><Th>{t.receive.colPartNo}</Th><Th>{t.receive.colPartName}</Th>
                      <Th>{t.receive.colVendor}</Th><Th>{t.receive.colPo}</Th>
                      <Th>{tab === "completed" ? t.receive.colInvRcv : t.receive.colDate}</Th>
                      <Th className="text-right">{t.receive.colQty}</Th>
                      <Th className="text-right pr-6">{t.receive.colActions}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((tk) => (
                      <tr key={tk.id} className="border-t hover:bg-[#f7f9fc] cursor-pointer" style={{ borderColor: "var(--border)" }}
                        onClick={() => router.push(`/receive/${tk.id}`)}>
                        <Td>
                          <Link href={`/receive/${tk.id}`} className="flex items-center gap-2 font-semibold" style={{ color: "var(--primary)" }}>
                            <Db /> {tk.invoiceNo}
                          </Link>
                          {tk.doNo && <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>DO: {tk.doNo}</div>}
                          <div className="mt-1">
                            <span className={`badge ${statusBadge(tk).cls}`}>{statusBadge(tk).label}</span>
                          </div>
                        </Td>
                        <Td>{tk.partNo}</Td>
                        <Td style={{ color: "var(--muted)" }}>{tk.partName || "—"}</Td>
                        <Td style={{ color: "var(--primary)" }}>{tk.vendor}</Td>
                        <Td style={{ color: "var(--muted)" }}>{tk.poNo || "—"}</Td>
                        <Td>
                          <div>{fmtDate(tk.invoiceDate, tk.createdAt)}</div>
                          {tk.receivedAt && (
                            <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                              {t.receive.rcv} {fmtDate(tk.receivedAt)}
                            </div>
                          )}
                        </Td>
                        <Td className="text-right font-bold text-base" style={{ color: "var(--primary)" }}>{tk.planQty}</Td>
                        <Td className="text-right pr-6">
                          <Link href={`/receive/${tk.id}`} className="inline-flex items-center gap-1" style={{ color: "var(--muted)" }}>
                            {t.common.viewDetail} <ChevronRight />
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
      {/* ── Sync Result Modal ── */}
      {syncModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.55)" }}
          onClick={e => { if (e.target === e.currentTarget) setSyncModal(false); }}>
          <div className="w-full max-w-sm rounded-xl shadow-2xl overflow-hidden"
            style={{ background: "var(--card)" }}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
              <span className="font-bold text-base">
                {syncError ? t.common.syncFailed : t.common.syncDone}
              </span>
              <button onClick={() => setSyncModal(false)} aria-label="Close"
                className="text-xl leading-none p-1" style={{ color: "var(--muted)" }}>×</button>
            </div>
            <div className="px-5 py-5 flex flex-col gap-3">
              {syncError ? (
                <p className="text-sm" style={{ color: "var(--error, #dc2626)" }}>{syncError}</p>
              ) : syncInfo && (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span style={{ color: "var(--muted)" }}>{t.receive.foundN(syncInfo.dbCount)}</span>
                  </div>
                  {syncInfo.sourceDuplicates > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span style={{ color: "var(--muted)" }}>Duplicates merged</span>
                      <span className="font-bold text-lg" style={{ color: "var(--primary)" }}>{syncInfo.sourceDuplicates}</span>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="px-5 pb-4">
              <button onClick={() => setSyncModal(false)}
                className="w-full py-2.5 rounded-lg font-semibold text-sm"
                style={{ background: syncError ? "var(--error, #dc2626)" : "var(--primary)", color: "#fff" }}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
