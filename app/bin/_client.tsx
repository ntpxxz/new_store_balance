"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import AppShell from "@/app/components/AppShell";
import { Search } from "@/app/components/icons";
import { api, type BinRow } from "@/lib/client";
import { useSearchRef } from "@/lib/hooks";
import { Th, Td, Info } from "@/app/components/table";
import { useLang } from "@/lib/lang";

export default function BinClient({ initialRows }: { initialRows?: BinRow[] }) {
  const { t } = useLang();
  const [search, setSearch, searchRef] = useSearchRef();
  const [rows, setRows] = useState<BinRow[]>(initialRows ?? []);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ok" | "error">(
    initialRows ? "ok" : "idle"
  );
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoadState("loading");
    try {
      const data = await api.searchStock(searchRef.current.trim() || undefined);
      setRows(data);
      setLoadState("ok");
    } catch (e: any) {
      setError(e.message);
      setLoadState("error");
    }
  }, []);

  const didInit = useRef(false);
  useEffect(() => {
    if (!didInit.current && initialRows) { didInit.current = true; return; }
    didInit.current = true;
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AppShell title={t.bin.title} active="bin" onRefresh={load}>
      <div className="max-w-6xl mx-auto">

        {/* Search bar */}
        <div className="sticky top-16 z-10 -mx-4 lg:-mx-8 px-4 lg:px-8 pt-3 pb-2 border-b mb-4"
          style={{ background: "var(--header)", borderColor: "var(--border)" }}>
          <div className="relative flex-1 max-w-md">
            <input className="field pr-9" placeholder={t.bin.searchPh}
              value={search}
              onChange={(e) => {
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
        </div>

        {loadState === "loading" && <Info>{t.common.loading}</Info>}
        {loadState === "error" && <Info bad>{error}</Info>}
        {loadState === "ok" && rows.length === 0 && <Info>{t.bin.noRows}</Info>}

        {loadState === "ok" && rows.length > 0 && (
          <>
            <p className="text-xs mb-3 font-medium" style={{ color: "var(--muted)" }}>
              {t.common.items(rows.length)}
            </p>

            {/* Mobile cards */}
            <div className="lg:hidden flex flex-col gap-2">
              {rows.map((r) => (
                <div key={r.id} className="card p-4">
                  <div className="flex items-center justify-between mb-1">
                    <Link href={`/parts?search=${encodeURIComponent(r.partNo)}`}
                      className="font-semibold text-sm" style={{ color: "var(--primary)" }}>
                      {r.partNo}
                    </Link>
                    <span className="font-bold text-base" style={{ color: r.quantity > 0 ? "var(--primary)" : "var(--muted)" }}>
                      {r.quantity}
                    </span>
                  </div>
                  <div className="text-sm">{r.partName || "—"}</div>
                  <div className="text-xs mt-1 flex gap-3 flex-wrap" style={{ color: "var(--muted)" }}>
                    <span>{t.bin.colLocation}: <strong style={{ color: "inherit" }}>{r.location}</strong></span>
                    {r.wh && <span>WH: {r.wh}</span>}
                    {r.stcl && <span>STCL: {r.stcl}</span>}
                    {r.as400Location && <span>AS400: {r.as400Location}</span>}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden lg:block card overflow-hidden">
              <table className="w-full text-sm">
                <thead style={{ background: "var(--table-head)" }}>
                  <tr className="text-left" style={{ color: "var(--muted)" }}>
                    <Th>{t.bin.colLocation}</Th>
                    <Th>WH</Th>
                    <Th>STCL</Th>
                    <Th>{t.bin.colPartNo}</Th>
                    <Th>{t.bin.colPartName}</Th>
                    <Th>{t.bin.colVendor}</Th>
                    <Th className="text-right">{t.bin.colQty}</Th>
                    <Th>{t.bin.colUpdated}</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <Td><strong style={{ color: "var(--primary)" }}>{r.location}</strong></Td>
                      <Td style={{ color: "var(--muted)" }}>{r.wh || "—"}</Td>
                      <Td style={{ color: "var(--muted)" }}>{r.stcl || "—"}</Td>
                      <Td>
                        <Link href={`/parts?search=${encodeURIComponent(r.partNo)}`}
                          className="font-semibold hover:underline" style={{ color: "var(--primary)" }}>
                          {r.partNo}
                        </Link>
                      </Td>
                      <Td style={{ color: "var(--muted)" }}>{r.partName || "—"}</Td>
                      <Td style={{ color: "var(--muted)" }}>{r.vendorName || "—"}</Td>
                      <Td className="text-right font-bold text-base"
                        style={{ color: r.quantity > 0 ? "var(--primary)" : "var(--muted)" }}>
                        {r.quantity}
                      </Td>
                      <Td style={{ color: "var(--muted)" }}>{r.latestUpdateDate || r.lastStockIn || "—"}</Td>
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
