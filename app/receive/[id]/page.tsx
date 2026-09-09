"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import { Barcode, Check, ChevronLeft, X, Flask } from "@/app/components/icons";
import InvoiceCard from "@/app/components/InvoiceCard";
import { api, getToken, type Task } from "@/lib/client";

type Stage = "receive" | "iqc" | "done" | "other";
function stageOf(status: string): Stage {
  if (status === "PENDING" || status === "ARRIVED") return "receive";
  if (status === "IQC_WAITING" || status === "IQC_IN_PROGRESS") return "iqc";
  // Put-away is skipped in this app: a finished IQC result (pass or fail) is Done.
  if (status === "COMPLETED" || status === "REJECTED") return "done";
  return "other";
}

export default function DetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [task, setTask] = useState<Task | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [error, setError] = useState("");

  // fetch all + find by id (no by-id GET endpoint). ponytail: add /[id] GET if the list grows large.
  const load = useCallback(async () => {
    setState("loading");
    try {
      const all = await api.listTasks("all");
      const found = all.find((t) => t.id === id) || null;
      setTask(found);
      setState(found ? "ok" : "error");
      if (!found) setError("Task not found");
    } catch (e: any) {
      setError(e.message);
      setState("error");
    }
  }, [id]);

  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    load();
  }, [load, router]);

  const stage = task ? stageOf(task.status) : "other";

  return (
    <AppShell title="Invoice Detail" active="receive" showBack onRefresh={load}>
      <div className="max-w-4xl mx-auto flex flex-col gap-4">
        {state === "loading" && <Card><p className="text-center text-sm" style={{ color: "var(--muted)" }}>Loading…</p></Card>}
        {state === "error" && <Card><p className="text-center text-sm" style={{ color: "var(--bad-fg)" }}>{error}</p></Card>}

        {state === "ok" && task && (
          <>
            <InvoiceCard task={task} />
            <BreakdownTable task={task} />
            {stage === "receive" && <ReceivePanel task={task} onDone={() => router.push("/receive")} />}
            {stage === "iqc" && <WaitingIqc task={task} />}
            {stage === "done" && <DonePanel task={task} />}
            {stage === "other" && <Card><span className="badge badge-bad">{task.status}</span></Card>}
          </>
        )}
      </div>
    </AppShell>
  );
}

function Card({ children, className = "" }: any) {
  return <div className={`card p-4 lg:p-6 ${className}`}>{children}</div>;
}

function BreakdownTable({ task }: { task: Task }) {
  const received = task.actualQty ?? 0;
  const status = task.actualQty == null ? ["badge-muted", "Pending"]
    : received < task.planQty ? ["badge-warn", "Shortage"]
    : ["badge-ok", "Verified"];
  return (
    <Card className="!p-0 overflow-hidden hidden lg:block">
      <table className="w-full text-sm">
        <thead style={{ background: "#f7f9fc" }}>
          <tr className="text-left" style={{ color: "var(--muted)" }}>
            <th className="px-4 py-3 font-medium">Item #</th>
            <th className="px-4 py-3 font-medium">Description</th>
            <th className="px-4 py-3 font-medium text-right">Expected Qty</th>
            <th className="px-4 py-3 font-medium text-right">Received Qty</th>
            <th className="px-4 py-3 font-medium text-right pr-6">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="px-4 py-4 font-semibold">01</td>
            <td className="px-4 py-4">{task.partName || task.partNo}</td>
            <td className="px-4 py-4 text-right">{task.planQty}</td>
            <td className="px-4 py-4 text-right font-semibold" style={received && received < task.planQty ? { color: "var(--warn-fg)" } : {}}>
              {task.actualQty ?? "—"}
            </td>
            <td className="px-4 py-4 text-right pr-6"><span className={`badge ${status[0]}`}>{status[1]}</span></td>
          </tr>
        </tbody>
      </table>
    </Card>
  );
}

function ReceivePanel({ task, onDone }: { task: Task; onDone: () => void }) {
  const [urgent, setUrgent] = useState(!!task.isUrgent);
  const [urgentReason, setUrgentReason] = useState("");
  const [showUrgent, setShowUrgent] = useState(false);
  const [note, setNote] = useState("");
  const [bin, setBin] = useState("");
  const [scanned, setScanned] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function confirm() {
    setErr(""); setBusy(true);
    try {
      const finalNote = urgent
        ? `[URGENT] ${urgentReason}${note ? ` — ${note}` : ""}`
        : (note || undefined);
      await api.receive(task.id, { receivedQty: task.planQty, isUrgent: urgent, note: finalNote, bin: bin || undefined });
      onDone();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <>
      {scanning && (
        <ScanOverlay invoiceNo={task.invoiceNo}
          onConfirm={() => { setScanned(true); setScanning(false); }}
          onCancel={() => setScanning(false)} />
      )}

      {!scanned ? (
        <Card className="text-center">
          <div className="font-bold mb-2">Scan to Receive</div>
          <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>Scan the invoice barcode to confirm receipt of {task.planQty} pcs.</p>
          <button className="btn btn-accent w-full" onClick={() => setScanning(true)}>
            <Barcode /> Scan Barcode
          </button>
        </Card>
      ) : (
        <Card>
          <div className="flex items-center gap-2 mb-4 font-bold">
            <Check style={{ color: "var(--ok-fg)" }} /> Scan Verified
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <Labeled label="Received Qty">
              <input className="field" value={task.planQty} readOnly />
            </Labeled>
            <Labeled label="Bin (optional — put-away happens after IQC)">
              <input className="field" placeholder="e.g. A-01" value={bin} onChange={(e) => setBin(e.target.value)} />
            </Labeled>
          </div>
          <Labeled label="Note" className="mt-4">
            <textarea className="field" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Labeled>
          <label className="flex items-center gap-2 mt-4 text-sm">
            <input type="checkbox" checked={urgent} onChange={(e) => {
              if (e.target.checked) setShowUrgent(true);
              else { setUrgent(false); setUrgentReason(""); }
            }} /> Mark urgent
          </label>
          {urgent && urgentReason && (
            <p className="text-xs mt-1" style={{ color: "var(--bad-fg)" }}>
              Reason: {urgentReason} · <button className="underline" onClick={() => setShowUrgent(true)}>edit</button>
            </p>
          )}
          {showUrgent && (
            <div className="fixed inset-0 z-[60] grid place-items-center p-4" style={{ background: "rgba(0,0,0,.6)" }} onClick={() => setShowUrgent(false)}>
              <div className="card w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
                <div className="font-bold">Urgent — reason required</div>
                <p className="text-xs mt-1 mb-3" style={{ color: "var(--muted)" }}>Why is this receipt urgent?</p>
                <textarea className="field" rows={3} autoFocus value={urgentReason}
                  onChange={(e) => setUrgentReason(e.target.value)} placeholder="e.g. line stopped, needed for MO today" />
                <div className="flex gap-3 mt-4">
                  <button className="btn btn-ghost flex-1" onClick={() => setShowUrgent(false)}>Cancel</button>
                  <button className="btn btn-primary flex-1" disabled={!urgentReason.trim()}
                    onClick={() => { setUrgent(true); setShowUrgent(false); }}>Save</button>
                </div>
              </div>
            </div>
          )}
          {err && <div className="badge badge-bad mt-4 w-full justify-center py-1.5">{err}</div>}
          <button className="btn btn-primary w-full mt-5" onClick={confirm} disabled={busy}>
            {busy ? "Saving…" : "Confirm & Register Receipt"}
          </button>
        </Card>
      )}
    </>
  );
}

function ScanOverlay({ invoiceNo, onConfirm, onCancel }: {
  invoiceNo: string; onConfirm: () => void; onCancel: () => void;
}) {
  const corners = ["top-4 left-4 border-t-2 border-l-2", "top-4 right-4 border-t-2 border-r-2",
    "bottom-4 left-4 border-b-2 border-l-2", "bottom-4 right-4 border-b-2 border-r-2"];
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<{ ok: true } | { ok: false; reason: string } | null>(null);
  const [retries, setRetries] = useState(0);
  const [manual, setManual] = useState(false);
  const [manualValue, setManualValue] = useState("");
  const [manualErr, setManualErr] = useState("");
  const [camErr, setCamErr] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const MAX_RETRIES = 3;

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      .then(stream => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => setCamErr("Camera unavailable — use manual entry"));
    return () => streamRef.current?.getTracks().forEach(t => t.stop());
  }, []);

  async function doScan() {
    if (!("BarcodeDetector" in window)) { setManual(true); return; }
    setResult(null); setScanning(true);
    try {
      // ponytail: BarcodeDetector is native Chrome/Edge — no lib needed
      const detector = new (window as any).BarcodeDetector({
        formats: ["qr_code", "code_128", "ean_13", "code_39", "data_matrix"],
      });
      const video = videoRef.current;
      if (!video) throw new Error("Camera not ready");
      let decoded: string | null = null;
      for (let i = 0; i < 10 && !decoded; i++) {
        await new Promise(r => setTimeout(r, 150));
        const hits = await detector.detect(video);
        if (hits.length > 0) decoded = hits[0].rawValue;
      }
      if (!decoded) {
        setRetries(n => n + 1);
        setResult({ ok: false, reason: "No barcode detected. Hold steady and try again." });
        return;
      }
      const norm = (s: string) => s.replace(/[-\/\s]/g, "").toUpperCase();
      if (decoded === invoiceNo || norm(decoded) === norm(invoiceNo)) {
        setResult({ ok: true });
      } else {
        setRetries(n => n + 1);
        setResult({ ok: false, reason: `Scanned: ${decoded} — expected: ${invoiceNo}` });
      }
    } catch (e: any) {
      setResult({ ok: false, reason: e?.message ?? "Camera error. Check permissions and try again." });
    } finally {
      setScanning(false);
    }
  }

  const tooManyRetries = retries >= MAX_RETRIES;

  function submitManual() {
    const entered = manualValue.trim().toUpperCase();
    const expected = invoiceNo.trim().toUpperCase();
    if (entered !== expected) {
      setManualErr(`Invoice number does not match. Expected: ${invoiceNo}`);
      return;
    }
    onConfirm();
  }

  if (manual) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#0f1720", color: "#fff" }}>
        <div className="flex items-center gap-3 px-4 h-16 shrink-0" style={{ background: "var(--header)", color: "var(--text)" }}>
          <button onClick={() => { setManual(false); setManualErr(""); }} aria-label="Back" className="text-xl -ml-1 p-1"><ChevronLeft /></button>
          <h1 className="flex-1 text-center text-base font-bold">Manual Entry</h1>
          <span className="w-6" />
        </div>
        <div className="flex-1 flex flex-col gap-4 px-4 py-8 max-w-md w-full mx-auto">
          <p className="text-sm" style={{ color: "#9aa4b2" }}>Enter the invoice number exactly as printed on the document.</p>
          <input
            className="field"
            placeholder={`e.g. ${invoiceNo}`}
            value={manualValue}
            onChange={(e) => { setManualValue(e.target.value); setManualErr(""); }}
            onKeyDown={(e) => e.key === "Enter" && submitManual()}
            autoFocus
          />
          {manualErr && <p className="text-sm" style={{ color: "var(--bad-fg)" }}>{manualErr}</p>}
          <button className="btn btn-primary w-full mt-2" onClick={submitManual} disabled={!manualValue.trim()}>
            Confirm
          </button>
          <button className="btn btn-ghost w-full" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#0f1720", color: "#fff" }}>
      <div className="flex items-center gap-3 px-4 h-16 shrink-0" style={{ background: "var(--header)", color: "var(--text)" }}>
        <button onClick={onCancel} aria-label="Back" className="text-xl -ml-1 p-1"><ChevronLeft /></button>
        <h1 className="flex-1 text-center text-base font-bold">Scan QR / Barcode</h1>
        <span className="w-6" />
      </div>
      <div className="flex-1 overflow-auto px-4 py-5 flex flex-col gap-4 max-w-md w-full mx-auto">
        <div className="relative rounded-2xl overflow-hidden" style={{ height: 240, background: "#000", border: "2px solid var(--accent)" }}>
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          {corners.map((c, k) => <span key={k} className={`absolute w-8 h-8 ${c}`} style={{ borderColor: "var(--accent)" }} />)}
          <span className="scanline" />
          {camErr && (
            <p className="absolute inset-0 flex items-center justify-center text-xs text-center px-4"
              style={{ color: "var(--warn-fg)", background: "rgba(0,0,0,.75)" }}>{camErr}</p>
          )}
        </div>
        <p className="text-center text-sm" style={{ color: "#9aa4b2" }}>Align invoice barcode within the frame to scan</p>
        {retries > 0 && !tooManyRetries && (
          <p className="text-center text-xs" style={{ color: "var(--warn-fg)" }}>
            {MAX_RETRIES - retries} attempt{MAX_RETRIES - retries !== 1 ? "s" : ""} remaining
          </p>
        )}
        <div className="flex gap-3 mt-auto">
          <button className="btn btn-accent flex-1" onClick={doScan} disabled={scanning || tooManyRetries}>
            <Barcode /> {scanning ? "Scanning…" : "Scan"}
          </button>
          <button className="btn btn-ghost flex-1" onClick={onCancel}>Cancel</button>
        </div>
        {tooManyRetries && (
          <p className="text-center text-sm" style={{ color: "var(--bad-fg)" }}>
            Too many failed attempts. Please contact a supervisor.
          </p>
        )}
      </div>

      {result && (
        <div className="fixed inset-0 z-[60] grid place-items-center p-4"
          style={{ background: "rgba(0,0,0,.6)" }}
          onClick={result.ok ? undefined : () => setResult(null)}>
          <div className="card w-full max-w-sm p-6 text-center" style={{ color: "var(--text)" }} onClick={(e) => e.stopPropagation()}>
            {result.ok ? (
              <>
                <div className="text-4xl mb-2 flex justify-center" style={{ color: "var(--ok-fg)" }}><Check /></div>
                <div className="font-bold text-lg" style={{ color: "var(--ok-fg)" }}>Scan Successful</div>
                <div className="text-sm mt-2 mb-5" style={{ color: "var(--muted)" }}>Tax Invoice: {invoiceNo}</div>
                <button className="btn w-full mb-2" style={{ background: "#16a34a", color: "#fff" }} onClick={onConfirm}>Confirm</button>
                <button className="btn btn-ghost w-full" onClick={() => setResult(null)}>Scan again</button>
              </>
            ) : (
              <>
                <div className="text-4xl mb-2 flex justify-center" style={{ color: "var(--bad-fg)" }}><X /></div>
                <div className="font-bold text-lg" style={{ color: "var(--bad-fg)" }}>Scan Failed</div>
                <div className="text-sm mt-2 mb-5" style={{ color: "var(--muted)" }}>{result.reason}</div>
                {tooManyRetries ? (
                  <>
                    <button className="btn btn-primary w-full mb-2" onClick={() => { setResult(null); setManual(true); }}>Enter Manually</button>
                    <button className="btn btn-ghost w-full" onClick={onCancel}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button className="btn w-full mb-2" style={{ background: "#ef4444", color: "#fff" }} onClick={doScan}>Retry</button>
                    <button className="btn btn-ghost w-full mb-2" onClick={() => { setResult(null); setManual(true); }}>Enter Manually</button>
                    <button className="btn btn-ghost w-full" onClick={onCancel}>Cancel</button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function WaitingIqc({ task }: { task: Task }) {
  return (
    <Card className="text-center">
      <div className="text-4xl mb-2 flex justify-center" style={{ color: "var(--primary)" }}><Flask /></div>
      <div className="font-bold">Waiting for IQC inspection</div>
      <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
        Received {task.actualQty} pcs. The IQC system will confirm the result — no action needed here.
      </p>
    </Card>
  );
}

function DonePanel({ task }: { task: Task }) {
  const failed = task.status === "REJECTED" || task.judgment === "FAIL";
  if (failed) {
    return (
      <Card className="text-center">
        <div className="text-4xl mb-2 flex justify-center" style={{ color: "var(--bad-fg)" }}><X /></div>
        <div className="font-bold" style={{ color: "var(--bad-fg)" }}>IQC Failed</div>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Rejected{task.failedQty != null ? ` — ${task.failedQty} pcs failed` : ""}.
          {task.defectReason ? ` Reason: ${task.defectReason}` : ""}
        </p>
      </Card>
    );
  }
  const stored = task.status === "COMPLETED" && task.targetLocation;
  return (
    <Card className="text-center">
      <div className="text-4xl mb-2 flex justify-center" style={{ color: "var(--ok-fg)" }}><Check /></div>
      <div className="font-bold">{stored ? "Completed" : "IQC Passed — Done"}</div>
      <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
        {stored
          ? <>Stored in bin <b>{task.targetLocation}</b>. AS400 queue row written.</>
          : <>Passed IQC ({task.passedQty ?? task.actualQty} pcs). Receipt complete — AS400 queue updated.</>}
      </p>
    </Card>
  );
}

function Labeled({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-sm font-medium mb-1">{label}</span>
      {children}
    </label>
  );
}
