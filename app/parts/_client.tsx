"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "@/app/components/AppShell";
import { Search, ChevronRight } from "@/app/components/icons";
import { api, type Part } from "@/lib/client";
import { useSearchRef } from "@/lib/hooks";
import { Th, Td, Info } from "@/app/components/table";
import { useLang } from "@/lib/lang";

export default function PartsClient({ initialParts }: { initialParts?: Part[] }) {
  const router = useRouter();
  const { t } = useLang();
  const [search, setSearch, searchRef] = useSearchRef();
  const [parts, setParts] = useState<Part[]>(initialParts ?? []);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ok" | "error">(initialParts ? "ok" : "idle");
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncInfo, setSyncInfo] = useState<{ upsertedParts: number; upsertedStocks: number } | null>(null);
  const [critOnly, setCritOnly] = useState(false);

  const load = useCallback(async () => {
    setLoadState("loading");
    try {
      const data = await api.listParts(searchRef.current.trim() || undefined);
      setParts(data);
      setLoadState("ok");
    } catch (e: any) {
      setError(e.message);
      setLoadState("error");
    }
  }, []);

  const handleSync = useCallback(() => {
    setSyncing(true);
    setSyncInfo(null);
    api.syncStock()
      .then((r) => setSyncInfo({ upsertedParts: r.upsertedParts, upsertedStocks: r.upsertedStocks }))
      .catch(() => {})
      .finally(() => { setSyncing(false); load(); });
  }, [load]);

  useEffect(() => {
    if (!initialParts) load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const displayed = critOnly ? parts.filter(p => p.qty <= p.safetyStock) : parts;

  return (
    <AppShell title={t.parts.title} active="parts" onRefresh={load} onSync={handleSync} syncBusy={syncing}>
      <div className="max-w-6xl mx-auto">

        {/* Sticky search bar */}
        <div className="sticky top-16 z-10 -mx-4 lg:-mx-8 px-4 lg:px-8 pt-3 pb-2 border-b mb-4"
          style={{ background: "var(--header)", borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2 max-w-md">
            <div className="relative flex-1">
              <input className="field pr-9" placeholder={t.parts.searchPh}
                value={search} onChange={(e) => {
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
            <button type="button" onClick={() => setCritOnly(v => !v)}
              className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
              style={critOnly
                ? { background: "var(--bad-bg)", color: "var(--bad-fg)", borderColor: "var(--bad-fg)" }
                : { color: "var(--muted)", borderColor: "var(--border)", background: "transparent" }}>
              {t.parts.criticalOnly}
            </button>
          </div>
          {(syncing || syncInfo) && (
            <p className="mt-1.5 text-xs" style={{ color: "var(--muted)" }}>
              {syncing
                ? t.parts.syncing
                : syncInfo && t.parts.synced(syncInfo.upsertedParts, syncInfo.upsertedStocks)
              }
            </p>
          )}
        </div>

        {loadState === "loading" && <Info>{t.common.loading}</Info>}
        {loadState === "error" && <Info bad>{error}</Info>}
        {loadState === "ok" && displayed.length === 0 && (
          <Info>{critOnly ? t.parts.noCritical : t.parts.noFound}</Info>
        )}

        {loadState === "ok" && displayed.length > 0 && (
          <>
            <p className="text-xs mb-3 font-medium" style={{ color: "var(--muted)" }}>
              {t.parts.nParts(displayed.length)}{critOnly ? ` ${t.parts.belowSafety}` : ""}
            </p>

            {/* Mobile cards */}
            <div className="lg:hidden flex flex-col gap-3">
              {displayed.map((p) => (
                <Link key={p.id} href={`/parts/${p.id}`} className="card p-4 block">
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-semibold text-sm" style={{ color: "var(--primary)" }}>{p.partNo}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: p.qty <= p.safetyStock ? "var(--bad-bg)" : "var(--ok-bg)", color: p.qty <= p.safetyStock ? "var(--bad-fg)" : "var(--ok-fg)" }}>
                      {p.qty} {p.unit ?? "pcs"}
                    </span>
                  </div>
                  <div className="text-sm font-medium mb-1">{p.name}</div>
                  <div className="text-xs" style={{ color: "var(--muted)" }}>
                    {p.divisionName && <span className="mr-3">{p.divisionName}</span>}
                    {t.parts.safety} {p.safetyStock}
                    {p.locations.length > 0 && <span className="ml-3">{t.parts.loc} {p.locations.join(", ")}</span>}
                  </div>
                </Link>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden lg:block card overflow-hidden">
              <table className="w-full text-sm">
                <thead style={{ background: "var(--table-head)" }}>
                  <tr className="text-left" style={{ color: "var(--muted)" }}>
                    <Th>{t.parts.colPartNo}</Th><Th>{t.parts.colName}</Th><Th>{t.parts.colDivision}</Th><Th>{t.parts.colUnit}</Th>
                    <Th className="text-right">{t.parts.colSafety}</Th><Th className="text-right">{t.parts.colOnHand}</Th>
                    <Th>{t.parts.colLocations}</Th><Th />
                  </tr>
                </thead>
                <tbody>
                  {displayed.map((p) => (
                    <tr key={p.id} className="border-t hover:bg-[#f7f9fc] cursor-pointer" style={{ borderColor: "var(--border)" }}
                      onClick={() => router.push(`/parts/${p.id}`)}>
                      <Td>
                        <Link href={`/parts/${p.id}`} className="font-semibold hover:underline" style={{ color: "var(--primary)" }}>{p.partNo}</Link>
                      </Td>
                      <Td>{p.name}</Td>
                      <Td style={{ color: "var(--muted)" }}>{p.divisionName ?? "—"}</Td>
                      <Td>{p.unit ?? "—"}</Td>
                      <Td className="text-right">{p.safetyStock}</Td>
                      <Td className="text-right font-bold text-base"
                        style={{ color: p.qty <= p.safetyStock ? "var(--bad-fg)" : "var(--primary)" }}>
                        {p.qty}
                      </Td>
                      <Td style={{ color: "var(--muted)" }}>{p.locations.join(", ") || "—"}</Td>
                      <Td className="pr-6">
                        <Link href={`/parts/${p.id}`} className="inline-flex items-center gap-1" style={{ color: "var(--muted)" }}>
                          {t.common.detail} <ChevronRight />
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
    </AppShell>
  );
}
