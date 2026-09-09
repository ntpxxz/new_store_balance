"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "@/app/components/AppShell";
import { Search, Db, ChevronRight } from "@/app/components/icons";
import InvoiceCard, { iqcResult, fmtDate } from "@/app/components/InvoiceCard";
import { api, getToken, type Task } from "@/lib/client";

export { iqcResult, fmtDate };

const TABS = [
  { key: "pending", label: "Pending" },
  { key: "iqc", label: "IQC" },
  { key: "completed", label: "Done" },
];

export default function ReceiveListPage() {
  const router = useRouter();
  const [tab, setTab] = useState("pending");
  const [search, setSearch] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncInfo, setSyncInfo] = useState<{ dbCount: number; sourceDuplicates: number } | null>(null);
  // keep latest search in ref so load() inside callbacks always sees current value
  const searchRef = useRef(search);
  searchRef.current = search;

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
    setSyncing(true);
    setSyncInfo(null);
    api.sync()
      .then((r) => setSyncInfo({ dbCount: r.dbCount, sourceDuplicates: r.sourceDuplicates }))
      .catch(() => {})
      .finally(() => {
        setSyncing(false);
        load();
      });
  }, [load]);

  // Auth once; on tab change auto-load list (no PBASS sync on browser refresh)
  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    load(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]); // intentional: search is manual (Enter), sync is manual button

  return (
    <AppShell title="Receive" active="receive" onRefresh={() => load()} onSync={handleSync} syncBusy={syncing}>
      <div className="max-w-6xl mx-auto">

        {/* Sticky search + tabs bar */}
        <div className="sticky top-16 z-10 -mx-4 lg:-mx-8 px-4 lg:px-8 pt-3 pb-2 border-b"
          style={{ background: "var(--header)", borderColor: "var(--border)" }}>
          <div className="lg:flex lg:items-center lg:justify-between gap-4 max-w-6xl mx-auto">
            <div className="relative lg:flex-1 lg:max-w-md mb-3 lg:mb-0">
              <input className="field pr-9" placeholder="Search invoice or vendor…"
                value={search} onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && load()} />
              <Search className="absolute right-3 top-2.5 text-lg" />
            </div>
            <div className="seg lg:w-80">
              {TABS.map((t) => (
                <button key={t.key} data-active={tab === t.key} onClick={() => setTab(t.key)}>{t.label}</button>
              ))}
            </div>
          </div>
          {/* Sync result line — stays visible when scrolled */}
          {(syncing || syncInfo) && (
            <p className="mt-1.5 text-xs" style={{ color: "var(--muted)" }}>
              {syncing
                ? "Syncing from PBASS…"
                : syncInfo && (
                  <>Found <strong>{syncInfo.dbCount}</strong> invoice(s) in DB
                    {syncInfo.sourceDuplicates > 0 && <> · {syncInfo.sourceDuplicates} PBASS duplicate(s) merged</>}
                  </>
                )
              }
            </p>
          )}
        </div>

        <div className="mt-4">
          {loadState === "loading" && <Info>Loading…</Info>}
          {loadState === "error" && <Info bad>{error}</Info>}
          {loadState === "ok" && tasks.length === 0 && <Info>No items in this tab.</Info>}

          {loadState === "ok" && tasks.length > 0 && (
            <>
              {/* count chip */}
              <p className="text-xs mb-3 font-medium" style={{ color: "var(--muted)" }}>
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
                      <Th>Inbound ID</Th><Th>Part No.</Th><Th>Vendor Code</Th><Th>PO Number</Th>
                      <Th>Date</Th><Th className="text-right">Qty</Th><Th className="text-right pr-6">Actions</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((t) => (
                      <tr key={t.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                        <Td>
                          <Link href={`/receive/${t.id}`} className="flex items-center gap-2 font-semibold" style={{ color: "var(--primary)" }}>
                            <Db /> {t.invoiceNo}
                          </Link>
                          {iqcResult(t) && <div className="mt-1"><span className={`badge ${iqcResult(t)!.cls}`}>{iqcResult(t)!.label}</span></div>}
                        </Td>
                        <Td>Part NO. {t.partNo}</Td>
                        <Td style={{ color: "var(--primary)" }}>{t.vendor}</Td>
                        <Td style={{ color: "var(--primary)" }}>PO NO:{t.poNo || "—"}</Td>
                        <Td>{fmtDate(t.invoiceDate, t.createdAt)}</Td>
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

const Th = ({ children, className = "" }: any) => <th className={`px-4 py-3 font-medium ${className}`}>{children}</th>;
const Td = ({ children, className = "", style }: any) => <td className={`px-4 py-4 ${className}`} style={style}>{children}</td>;
function Info({ children, bad }: { children: React.ReactNode; bad?: boolean }) {
  return <div className="card p-8 text-center text-sm" style={{ color: bad ? "var(--bad-fg)" : "var(--muted)" }}>{children}</div>;
}
