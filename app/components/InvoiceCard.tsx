"use client";

import Link from "next/link";
import { Db, ChevronRight } from "@/app/components/icons";
import { type Task } from "@/lib/client";

// IQC result badge for finished tasks; null while still in-progress.
export function iqcResult(t: Task): { label: string; cls: string } | null {
  if (t.status === "REJECTED" || t.judgment === "FAIL") return { label: "IQC Fail", cls: "badge-bad" };
  if (t.status === "COMPLETED" || t.judgment === "PASS") return { label: "IQC Pass", cls: "badge-ok" };
  return null;
}

// Full status badge covering all task states.
export function statusBadge(t: Task): { label: string; cls: string } {
  const iqc = iqcResult(t);
  if (iqc) return iqc;
  if (t.status === "ARRIVED") return { label: "Arrived", cls: "badge-warn" };
  if (t.status === "IQC_WAITING") return { label: "IQC Waiting", cls: "badge-warn" };
  if (t.status === "IQC_IN_PROGRESS") return { label: "In IQC", cls: "badge-warn" };
  return { label: "Pending", cls: "badge-muted" };
}

export function fmtDate(d?: string | null, fallback?: string | null) {
  const v = d || fallback;
  if (!v) return "—";
  const dt = new Date(v);
  if (isNaN(dt.getTime())) return "—";
  return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
}

// Shared invoice "vcard" — the list (as a link) and the detail header render the same thing.
export default function InvoiceCard({ task, href, showViewDetail = false, className = "" }: {
  task: Task; href?: string; showViewDetail?: boolean; className?: string;
}) {
  const status = statusBadge(task);
  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: "var(--muted)" }}>Tax Inv No.</div>
          <div className="text-lg font-bold leading-tight tracking-tight" style={{ color: "var(--primary)" }}>{task.invoiceNo}</div>
          <div className="mt-1.5 flex items-center gap-1.5 text-sm font-medium" style={{ color: "var(--primary)" }}>
            <Db /> {task.partNo}
          </div>
          {task.partName && <div className="text-xs mt-0.5 truncate" style={{ color: "var(--muted)" }}>{task.partName}</div>}
        </div>
        <div className="text-right leading-none shrink-0">
          <div className="text-[11px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>Qty</div>
          <div className="mt-1 text-2xl font-bold tabular-nums" style={{ color: "var(--primary)" }}>{task.planQty}</div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {task.isUrgent && <span className="badge badge-bad">URGENT</span>}
        <span className={`badge ${status.cls}`}>{status.label}</span>
      </div>

      <div className="mt-4 pt-3 border-t flex items-center justify-between gap-4 text-xs" style={{ borderColor: "var(--border)" }}>
        <div className="flex flex-col gap-0.5 min-w-0" style={{ color: "var(--primary)" }}>
          <span className="truncate"><span style={{ color: "var(--muted)" }}>Vendor:</span> {task.vendor}</span>
          <span className="truncate" style={{ color: "var(--muted)" }}>PO: {task.poNo || "—"}</span>
        </div>
        <div className="flex flex-col items-end gap-0.5 shrink-0 text-right">
          <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>Invoice</span>
          <span style={{ color: "var(--primary)" }}>{fmtDate(task.invoiceDate, task.createdAt)}</span>
          {showViewDetail && <span className="flex items-center gap-1 mt-0.5" style={{ color: "var(--muted)" }}>view detail <ChevronRight /></span>}
        </div>
      </div>
    </>
  );

  return href
    ? <Link href={href} aria-label={`Invoice ${task.invoiceNo}, view detail`} className={`card p-5 block active:scale-[.99] transition ${className}`}>{inner}</Link>
    : <div className={`card p-5 lg:p-6 ${className}`}>{inner}</div>;
}
