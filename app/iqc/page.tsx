"use client";

import { useCallback, useEffect } from "react";
import Link from "next/link";
import AppShell from "@/app/components/AppShell";
import { Search, Flask, ChevronRight } from "@/app/components/icons";
import { api, type Task } from "@/lib/client";
import { statusBadge, fmtDate } from "@/app/components/InvoiceCard";
import { useAuthRedirect, useSearchRef } from "@/lib/hooks";
import { Info } from "@/app/components/table";
import { useState } from "react";

export default function IqcListPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [error, setError] = useState("");
  const [search, setSearch, searchRef] = useSearchRef();

  const load = useCallback(async () => {
    setLoadState("loading");
    try {
      const data = await api.listTasks("iqc", searchRef.current.trim() || undefined);
      setTasks(data);
      setLoadState("ok");
    } catch (e: any) {
      setError(e.message);
      setLoadState("error");
    }
  }, []);

  useAuthRedirect();
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AppShell title="IQC Queue" active="iqc" onRefresh={load}>
      <div className="max-w-4xl mx-auto">

        {/* Sticky search */}
        <div className="sticky top-16 z-10 -mx-4 lg:-mx-8 px-4 lg:px-8 pt-3 pb-2 border-b mb-4"
          style={{ background: "var(--header)", borderColor: "var(--border)" }}>
          <div className="relative max-w-md">
            <input className="field pr-9" placeholder="Search part, invoice, vendor…"
              value={search} onChange={(e) => {
                const v = e.target.value;
                setSearch(v);
                if (v === "") { searchRef.current = ""; load(); }
              }}
              onKeyDown={(e) => e.key === "Enter" && load()} />
            <button type="button" onClick={load} aria-label="Search"
              className="absolute right-2.5 top-2 p-0.5" style={{ color: "var(--muted)" }}>
              <Search className="text-lg" />
            </button>
          </div>
        </div>

        {loadState === "loading" && <Info>Loading…</Info>}
        {loadState === "error" && <Info bad>{error}</Info>}
        {loadState === "ok" && tasks.length === 0 && (
          <Info>No items waiting for IQC — all clear.</Info>
        )}

        {loadState === "ok" && tasks.length > 0 && (
          <>
            <p className="text-xs mb-3 font-medium text-right" style={{ color: "var(--muted)" }}>
              {tasks.length} item{tasks.length !== 1 ? "s" : ""} waiting
            </p>

            <div className="flex flex-col gap-3">
              {tasks.map((t) => (
                <Link key={t.id} href={`/receive/${t.id}`}
                  className="card p-4 block hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Flask className="text-sm shrink-0" style={{ color: "var(--primary)" }} />
                        <span className="font-semibold text-sm" style={{ color: "var(--primary)" }}>{t.invoiceNo}</span>
                        <span className={`badge ${statusBadge(t).cls}`}>{statusBadge(t).label}</span>
                        {t.isUrgent && <span className="badge badge-bad">URGENT</span>}
                      </div>
                      <div className="font-medium text-sm mb-0.5">{t.partName || t.partNo}</div>
                      <div className="text-xs" style={{ color: "var(--muted)" }}>
                        {t.partNo} · {t.vendor}
                        {t.poNo && <> · PO {t.poNo}</>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold text-lg" style={{ color: "var(--primary)" }}>{t.actualQty ?? t.planQty}</div>
                      <div className="text-xs" style={{ color: "var(--muted)" }}>pcs</div>
                      <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>{fmtDate(t.invoiceDate, t.createdAt)}</div>
                    </div>
                  </div>
                  <div className="flex justify-end mt-2">
                    <span className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--muted)" }}>
                      Inspect <ChevronRight />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
