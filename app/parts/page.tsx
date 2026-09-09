"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "@/app/components/AppShell";
import { Search, ChevronRight } from "@/app/components/icons";
import { api, getToken, type Part } from "@/lib/client";

export default function PartsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [parts, setParts] = useState<Part[]>([]);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncInfo, setSyncInfo] = useState<{ upsertedParts: number; upsertedStocks: number } | null>(null);
  const searchRef = useRef(search);
  searchRef.current = search;

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

  // Auth once + initial list load (no PBASS sync on browser refresh)
  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppShell title="Parts" active="parts" onRefresh={load} onSync={handleSync} syncBusy={syncing}>
      <div className="max-w-6xl mx-auto">

        {/* Sticky search bar */}
        <div className="sticky top-16 z-10 -mx-4 lg:-mx-8 px-4 lg:px-8 pt-3 pb-2 border-b mb-4"
          style={{ background: "var(--header)", borderColor: "var(--border)" }}>
          <div className="relative max-w-md">
            <input className="field pr-9" placeholder="Search part no, name, division…"
              value={search} onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()} />
            <Search className="absolute right-3 top-2.5 text-lg" />
          </div>
          {(syncing || syncInfo) && (
            <p className="mt-1.5 text-xs" style={{ color: "var(--muted)" }}>
              {syncing
                ? "Syncing stock from PBASS…"
                : syncInfo && <>Synced <strong>{syncInfo.upsertedParts}</strong> parts · <strong>{syncInfo.upsertedStocks}</strong> stock locations</>
              }
            </p>
          )}
        </div>

        {loadState === "loading" && <Info>Loading…</Info>}
        {loadState === "error" && <Info bad>{error}</Info>}
        {loadState === "ok" && parts.length === 0 && <Info>No parts found.</Info>}

        {loadState === "ok" && parts.length > 0 && (
          <>
            <p className="text-xs mb-3 font-medium" style={{ color: "var(--muted)" }}>
              {parts.length} part{parts.length !== 1 ? "s" : ""}
            </p>

            {/* Mobile cards */}
            <div className="lg:hidden flex flex-col gap-3">
              {parts.map((p) => (
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
                    Safety: {p.safetyStock}
                    {p.locations.length > 0 && <span className="ml-3">📍 {p.locations.join(", ")}</span>}
                  </div>
                </Link>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden lg:block card overflow-hidden">
              <table className="w-full text-sm">
                <thead style={{ background: "#f7f9fc" }}>
                  <tr className="text-left" style={{ color: "var(--muted)" }}>
                    <Th>Part No.</Th><Th>Name</Th><Th>Division</Th><Th>Unit</Th>
                    <Th className="text-right">Safety Stock</Th><Th className="text-right">On Hand</Th><Th>Locations</Th><Th />
                  </tr>
                </thead>
                <tbody>
                  {parts.map((p) => (
                    <tr key={p.id} className="border-t" style={{ borderColor: "var(--border)" }}>
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
                          detail <ChevronRight />
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

const Th = ({ children, className = "" }: any) => <th className={`px-4 py-3 font-medium ${className}`}>{children}</th>;
const Td = ({ children, className = "", style }: any) => <td className={`px-4 py-4 ${className}`} style={style}>{children}</td>;
function Info({ children, bad }: { children: React.ReactNode; bad?: boolean }) {
  return <div className="card p-8 text-center text-sm" style={{ color: bad ? "var(--bad-fg)" : "var(--muted)" }}>{children}</div>;
}
