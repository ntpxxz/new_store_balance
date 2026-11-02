"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import { Barcode, QrScan, Check, ChevronLeft, X, Flask, Monitor } from "@/app/components/icons";
import InvoiceCard from "@/app/components/InvoiceCard";
import { api, getUser, type Task } from "@/lib/client";
import { useAuthRedirect } from "@/lib/hooks";
import { useLang } from "@/lib/lang";

type LFn = (en: string, th: string) => string;
function useL(): LFn {
  const { lang } = useLang();
  return (en, th) => (lang === "th" ? th : en);
}

type Stage = "receive" | "as400_pending" | "iqc" | "done" | "other";
function stageOf(status: string): Stage {
  if (status === "PENDING") return "receive";
  if (status === "ARRIVED") return "as400_pending";
  if (status === "IQC_WAITING" || status === "IQC_IN_PROGRESS") return "iqc";
  if (status === "COMPLETED" || status === "REJECTED") return "done";
  return "other";
}

export default function DetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const L = useL();
  const [task, setTask] = useState<Task | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const found = await api.getTask(id);
      setTask(found);
      setState("ok");
    } catch (e: any) {
      setError(e.message);
      setState("error");
    }
  }, [id]);

  useAuthRedirect();
  useEffect(() => {
    setState("loading");
    load();
  }, [load]);

  const stage = task ? stageOf(task.status) : "other";

  // Poll while waiting for AS400 RPA confirmation or IQC result
  useEffect(() => {
    if (stage !== "as400_pending" && stage !== "iqc") return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [stage, load]);

  return (
    <AppShell title={L("Invoice Detail", "รายละเอียดใบแจ้งหนี้")} active="receive" showBack onRefresh={load}>
      <div className="max-w-4xl mx-auto flex flex-col gap-4">
        {state === "loading" && <Card><p className="text-center text-sm" style={{ color: "var(--muted)" }}>{L("Loading…", "กำลังโหลด…")}</p></Card>}
        {state === "error" && <Card><p className="text-center text-sm" style={{ color: "var(--bad-fg)" }}>{error}</p></Card>}

        {state === "ok" && task && (
          <>
            <InvoiceCard task={task} />
            <BreakdownTable task={task} />
            {stage === "receive"      && <ReceivePanel task={task} onDone={load} />}
            {stage === "as400_pending" && <WaitingAs400Panel />}
            {stage === "iqc"          && <IqcPanel task={task} onDone={load} />}
            {stage === "done"         && <DonePanel task={task} />}
            {stage === "other"        && <Card><span className="badge badge-bad">{task.status}</span></Card>}
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
  const L = useL();
  const received = task.actualQty ?? 0;
  const status = task.actualQty == null || task.actualQty === 0 ? ["badge-muted", L("Pending", "รอรับ")]
    : received < task.planQty ? ["badge-warn", L("Shortage", "ขาด")]
    : ["badge-ok", L("Verified", "ตรงจำนวน")];
  return (
    <Card className="!p-0 overflow-hidden hidden lg:block">
      <table className="w-full text-sm">
        <thead style={{ background: "#f7f9fc" }}>
          <tr className="text-left" style={{ color: "var(--muted)" }}>
            <th className="px-4 py-3 font-medium">{L("Item #", "ลำดับ")}</th>
            <th className="px-4 py-3 font-medium">{L("Description", "รายละเอียด")}</th>
            <th className="px-4 py-3 font-medium text-right">{L("Expected Qty", "จำนวนตามแผน")}</th>
            <th className="px-4 py-3 font-medium text-right">{L("Received Qty", "รับได้")}</th>
            <th className="px-4 py-3 font-medium text-right pr-6">{L("Status", "สถานะ")}</th>
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

function WaitingAs400Panel() {
  const L = useL();
  return (
    <Card className="text-center">
      <div className="text-3xl mb-3 flex justify-center animate-pulse" style={{ color: "var(--primary)" }}>
        <Monitor />
      </div>
      <div className="font-bold">{L("Waiting for RPA to fill AS400", "รอ RPA กรอกข้อมูลใน AS400")}</div>
      <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
        {L("The system is sending data to AS400 automatically — a notification will appear when it's ready to confirm.", "ระบบกำลังส่งข้อมูลเข้า AS400 อัตโนมัติ — แจ้งเตือนจะโผล่ขึ้นมาเมื่อพร้อมให้ยืนยัน")}
      </p>
      <div className="mt-4 flex justify-center gap-1">
        {[0,1,2].map(i => (
          <span key={i} className="w-2 h-2 rounded-full animate-bounce" style={{ background: "var(--primary)", animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
    </Card>
  );
}

type CountMode = "qty" | "box";

function ReceivePanel({ task, onDone }: { task: Task; onDone: () => void }) {
  const L = useL();
  const [mode, setMode] = useState<CountMode | null>(null);
  const [urgent, setUrgent] = useState(!!task.isUrgent);
  const [urgentReason, setUrgentReason] = useState("");
  const [showUrgent, setShowUrgent] = useState(false);
  const [note, setNote] = useState("");
  const [bin, setBin] = useState("");
  const [countedQty, setCountedQty] = useState("");
  const [racks, setRacks] = useState<string[]>([]);
  useEffect(() => {
    api.listBinConfigs().then((b) => setRacks(b.filter((x) => !x.isLocked).map((x) => x.location))).catch(() => {});
  }, []);
  const [scanned, setScanned] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const counted = Number(countedQty);
  const countEntered = countedQty !== "" && !isNaN(counted) && counted > 0;
  const verify: { cls: string; label: string } | null = !countEntered
    ? null
    : counted === task.planQty
      ? { cls: "badge-ok", label: L("Match", "ตรงจำนวน") }
      : counted < task.planQty
        ? { cls: "badge-warn", label: L(`Shortage — ${task.planQty - counted} short`, `ขาด ${task.planQty - counted} ชิ้น`) }
        : { cls: "badge-bad", label: L(`Over — ${counted - task.planQty} extra (not allowed)`, `เกิน ${counted - task.planQty} ชิ้น (ไม่อนุญาต)`) };
  const overCount = countEntered && counted > task.planQty;

  async function confirm() {
    setErr(""); setBusy(true);
    try {
      const finalNote = urgent
        ? `[URGENT] ${urgentReason}${note ? ` — ${note}` : ""}`
        : (note || undefined);
      await api.receive(task.id, { receivedQty: counted, isUrgent: urgent, note: finalNote, bin: bin || undefined });
      onDone(); // reload task → status=ARRIVED → WaitingAs400Panel shows, AppShell modal polls
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <>
      {scanning && (
        <ScanOverlay doNo={task.invoiceNo}
          onConfirm={() => { setScanned(true); setScanning(false); }}
          onCancel={() => setScanning(false)} />
      )}

      {mode === null ? (
        <Card>
          <div className="font-bold mb-1">{L("Choose receive mode", "เลือกวิธีรับสินค้า")}</div>
          <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
            {L("Verify total quantity, or scan each box individually.", "ตรวจจำนวนรวม หรือสแกนทีละกล่อง")}
          </p>
          <div className="grid gap-3 lg:grid-cols-2">
            <button className="card p-4 text-left hover:shadow-md transition-shadow"
              style={{ border: "1px solid var(--border)" }}
              onClick={() => setMode("qty")}>
              <div className="font-semibold">{L("Verify quantity only", "ตรวจจำนวนรวม")}</div>
              <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                {L(`Enter one total count — compare against expected ${task.planQty}.`, `กรอกจำนวนรวม เทียบกับจำนวนตามแผน ${task.planQty}`)}
              </p>
            </button>
            <button className="card p-4 text-left opacity-60 cursor-not-allowed"
              style={{ border: "1px solid var(--border)" }}
              disabled title={L("Coming soon", "เร็ว ๆ นี้")}>
              <div className="font-semibold">
                {L("Count by box", "นับทีละกล่อง")} <span className="badge badge-muted ml-1">{L("Soon", "เร็ว ๆ นี้")}</span>
              </div>
              <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                {L(`Scan each box QR (1/n), count contents, sum must equal ${task.planQty}.`, `สแกน QR แต่ละกล่อง (1/n) นับของในกล่อง รวมต้องเท่ากับ ${task.planQty}`)}
              </p>
            </button>
          </div>
        </Card>
      ) : !scanned ? (
        <Card className="text-center">
          <button className="btn btn-ghost mb-3 text-xs" onClick={() => setMode(null)}>
            {L("← Change mode", "← เปลี่ยนวิธี")}
          </button>
          <button className="btn btn-accent w-full" onClick={() => setScanning(true)} aria-label={L("Scan QR", "สแกน QR")}>
            <QrScan className="text-lg" /> {L("Scan", "สแกน")}
          </button>
        </Card>
      ) : (
        <Card>
          <div className="flex items-center gap-2 mb-4 font-bold">
            <Check style={{ color: "var(--ok-fg)" }} /> {L("Scan Verified", "สแกนสำเร็จ")}
          </div>
          <div className="grid lg:grid-cols-3 gap-4">
            <Labeled label={L("Expected Qty", "จำนวนตามแผน")}>
              <input className="field" value={task.planQty} readOnly />
            </Labeled>
            <Labeled label={L("Counted Qty *", "นับได้ *")}>
              <input className="field" type="number" min={1} max={task.planQty} inputMode="numeric"
                placeholder={L("Count box contents", "นับของในกล่อง")} value={countedQty}
                onChange={(e) => setCountedQty(e.target.value)} autoFocus />
            </Labeled>
            <Labeled label={L("Store Bin (rack) *", "Bin ที่เก็บ (rack) *")}>
              {/* ponytail: native datalist — pick a registered rack or scan/type it; server rejects unregistered */}
              <input className="field" placeholder={L("e.g. A-01", "เช่น A-01")} list="rack-list" value={bin}
                onChange={(e) => setBin(e.target.value)} required />
              <datalist id="rack-list">{racks.map((r) => <option key={r} value={r} />)}</datalist>
            </Labeled>
          </div>
          {verify && (
            <div className="mt-3">
              <span className={`badge ${verify.cls}`}>{verify.label}</span>
            </div>
          )}
          <Labeled label={L("Note", "หมายเหตุ")} className="mt-4">
            <textarea className="field" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Labeled>
          <label className="flex items-center gap-2 mt-4 text-sm">
            <input type="checkbox" checked={urgent} onChange={(e) => {
              if (e.target.checked) setShowUrgent(true);
              else { setUrgent(false); setUrgentReason(""); }
            }} /> {L("Mark urgent", "ทำเครื่องหมายเร่งด่วน")}
          </label>
          {urgent && urgentReason && (
            <p className="text-xs mt-1" style={{ color: "var(--bad-fg)" }}>
              {L("Reason", "เหตุผล")}: {urgentReason} · <button className="underline" onClick={() => setShowUrgent(true)}>{L("edit", "แก้ไข")}</button>
            </p>
          )}
          {showUrgent && (
            <div className="fixed inset-0 z-[60] grid place-items-center p-4" style={{ background: "rgba(0,0,0,.6)" }} onClick={() => setShowUrgent(false)}>
              <div className="card w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
                <div className="font-bold">{L("Urgent — reason required", "เร่งด่วน — ต้องระบุเหตุผล")}</div>
                <p className="text-xs mt-1 mb-3" style={{ color: "var(--muted)" }}>{L("Why is this receipt urgent?", "ทำไมรับครั้งนี้ถึงเร่งด่วน?")}</p>
                <textarea className="field" rows={3} autoFocus value={urgentReason}
                  onChange={(e) => setUrgentReason(e.target.value)} placeholder={L("e.g. line stopped, needed for MO today", "เช่น ไลน์หยุด ต้องใช้ MO วันนี้")} />
                <div className="flex gap-3 mt-4">
                  <button className="btn btn-ghost flex-1" onClick={() => setShowUrgent(false)}>{L("Cancel", "ยกเลิก")}</button>
                  <button className="btn btn-primary flex-1" disabled={!urgentReason.trim()}
                    onClick={() => { setUrgent(true); setShowUrgent(false); }}>{L("Save", "บันทึก")}</button>
                </div>
              </div>
            </div>
          )}
          {err && <div className="badge badge-bad mt-4 w-full justify-center py-1.5">{err}</div>}
          <button className="btn btn-primary w-full mt-5" onClick={confirm}
            disabled={busy || !bin.trim() || !countEntered || overCount}>
            {busy ? L("Saving…", "กำลังบันทึก…") : L("Confirm & Register Receipt", "ยืนยันและบันทึกการรับ")}
          </button>
        </Card>
      )}
    </>
  );
}

function ScanOverlay({ doNo, itemDraw, onConfirm, onCancel }: {
  doNo: string; itemDraw?: string | null; onConfirm: () => void; onCancel: () => void;
}) {
  const L = useL();
  const corners = ["top-4 left-4 border-t-2 border-l-2", "top-4 right-4 border-t-2 border-r-2",
    "bottom-4 left-4 border-b-2 border-l-2", "bottom-4 right-4 border-b-2 border-r-2"];
  const [result, setResult] = useState<{ ok: true } | { ok: false; reason: string } | null>(null);
  const [retries, setRetries] = useState(0);
  const [manual, setManual] = useState(false);
  const [manualValue, setManualValue] = useState("");
  const [manualErr, setManualErr] = useState("");
  const [camErr, setCamErr] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const MAX_RETRIES = 3;
  const norm = (s: string) => s.replace(/[-\/\s]/g, "").toUpperCase();

  function stopReader() {
    controlsRef.current?.stop();
    controlsRef.current = null;
  }

  function startReader() {
    if (!videoRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamErr(L("Camera requires HTTPS — use manual entry", "กล้องต้องใช้ HTTPS — กรุณากรอกด้วยตนเอง"));
      return;
    }
    import("@zxing/browser").then(({ BrowserMultiFormatReader }) => {
      const reader = new BrowserMultiFormatReader();
      reader.decodeFromVideoDevice(undefined, videoRef.current!, (res, err, controls) => {
        if (!res) return; // NotFoundException fires on every empty frame — normal
        controlsRef.current = controls;
        stopReader();
        const decoded = res.getText();
        const firstField = decoded.indexOf(',') > 0
          ? decoded.slice(0, decoded.indexOf(',')).replace(/[{}]/g, '').trim()
          : decoded;
        if (norm(firstField) === norm(doNo)) {
          setResult({ ok: true });
        } else {
          setRetries(n => n + 1);
          setResult({ ok: false, reason: L(`Scanned: "${decoded}" — expected: "${doNo}"`, `สแกนได้: "${decoded}" — คาดหวัง: "${doNo}"`) });
        }
      }).then(controls => {
        controlsRef.current = controls;
      }).catch((e: any) => {
        setCamErr(e?.message ?? L("Camera unavailable — use manual entry", "กล้องใช้งานไม่ได้ — กรุณากรอกด้วยตนเอง"));
      });
    }).catch(() => setCamErr(L("Scanner unavailable — use manual entry", "สแกนเนอร์ใช้งานไม่ได้ — กรุณากรอกด้วยตนเอง")));
  }

  // start on mount, restart when result is dismissed (retry), stop on unmount
  useEffect(() => { startReader(); return stopReader; }, []);
  useEffect(() => { if (result === null && !manual && !camErr) startReader(); }, [result, manual, camErr]);

  const tooManyRetries = retries >= MAX_RETRIES;

  function submitManual() {
    const raw = manualValue.trim();
    const firstField = raw.indexOf(',') > 0
      ? raw.slice(0, raw.indexOf(',')).replace(/[{}]/g, '').trim()
      : raw;
    if (norm(firstField) !== norm(doNo)) {
      setManualErr(L(`Invoice number does not match. Expected: ${doNo}`, `เลขใบแจ้งหนี้ไม่ตรง คาดหวัง: ${doNo}`));
      return;
    }
    onConfirm();
  }

  if (manual) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#0f1720", color: "#fff" }}>
        <div className="flex items-center gap-3 px-4 h-16 shrink-0" style={{ background: "var(--header)", color: "var(--text)" }}>
          <button onClick={() => { setManual(false); setManualErr(""); }} aria-label={L("Back", "ย้อนกลับ")} className="text-xl -ml-1 p-1"><ChevronLeft /></button>
          <h1 className="flex-1 text-center text-base font-bold">{L("Manual Entry", "กรอกด้วยตนเอง")}</h1>
          <span className="w-6" />
        </div>
        <div className="flex-1 flex flex-col gap-4 px-4 py-8 max-w-md w-full mx-auto">
          <p className="text-sm" style={{ color: "#9aa4b2" }}>{L("Enter the DO number exactly as printed on the document.", "กรอกเลข DO ให้ตรงกับที่พิมพ์บนเอกสาร")}</p>
          <input
            className="field"
            style={{ color: "#000" }}
            placeholder={L(`e.g. ${doNo}`, `เช่น ${doNo}`)}
            value={manualValue}
            onChange={(e) => { setManualValue(e.target.value); setManualErr(""); }}
            onKeyDown={(e) => e.key === "Enter" && submitManual()}
            autoFocus
          />
          {manualErr && <p className="text-sm" style={{ color: "var(--bad-fg)" }}>{manualErr}</p>}
          <button className="btn btn-primary w-full mt-2" onClick={submitManual} disabled={!manualValue.trim()}>
            {L("Confirm", "ยืนยัน")}
          </button>
          <button className="btn btn-ghost w-full" onClick={onCancel}>{L("Cancel", "ยกเลิก")}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#0f1720", color: "#fff" }}>
      <div className="flex items-center gap-3 px-4 h-16 shrink-0" style={{ background: "var(--header)", color: "var(--text)" }}>
        <button onClick={onCancel} aria-label={L("Back", "ย้อนกลับ")} className="text-xl -ml-1 p-1"><ChevronLeft /></button>
        <h1 className="flex-1 text-center text-base font-bold">{L("Scan QR / Barcode", "สแกน QR / บาร์โค้ด")}</h1>
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
        <p className="text-center text-sm" style={{ color: "#9aa4b2" }}>
          {camErr ? camErr : L("Point camera at the invoice barcode or QR code — scanning automatically", "ส่องกล้องไปที่บาร์โค้ดหรือ QR บนใบแจ้งหนี้ — สแกนอัตโนมัติ")}
        </p>
        {retries > 0 && !tooManyRetries && (
          <p className="text-center text-xs" style={{ color: "var(--warn-fg)" }}>
            {L(`${MAX_RETRIES - retries} attempt${MAX_RETRIES - retries !== 1 ? "s" : ""} remaining`, `เหลืออีก ${MAX_RETRIES - retries} ครั้ง`)}
          </p>
        )}
        {!camErr && !tooManyRetries && (
          <div className="flex items-center justify-center gap-2 text-sm" style={{ color: "#9aa4b2" }}>
            <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ background: "var(--accent)" }} />
            {L("Scanning…", "กำลังสแกน…")}
          </div>
        )}
        <div className="flex gap-3 mt-auto">
          <button className="btn btn-primary flex-1" onClick={() => { stopReader(); setManual(true); }}>
            <Barcode /> {L("Enter Manually", "กรอกด้วยตนเอง")}
          </button>
          <button className="btn btn-ghost flex-1" onClick={onCancel}>{L("Cancel", "ยกเลิก")}</button>
        </div>
        {tooManyRetries && (
          <p className="text-center text-sm" style={{ color: "var(--bad-fg)" }}>
            {L("Too many failed attempts. Please contact a supervisor.", "สแกนผิดเกินกำหนด กรุณาติดต่อหัวหน้างาน")}
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
                <div className="font-bold text-lg" style={{ color: "var(--ok-fg)" }}>{L("Scan Successful", "สแกนสำเร็จ")}</div>
                <div className="text-sm mt-2" style={{ color: "var(--muted)" }}>{L("DO No", "เลข DO")}: {doNo}</div>
                {itemDraw && <div className="text-sm mb-5" style={{ color: "var(--muted)" }}>{L("Drawing", "แบบ")}: {itemDraw}</div>}
                {!itemDraw && <div className="mb-5" />}
                <button className="btn w-full mb-2" style={{ background: "#16a34a", color: "#fff" }} onClick={onConfirm}>{L("Confirm", "ยืนยัน")}</button>
                <button className="btn btn-ghost w-full" onClick={() => setResult(null)}>{L("Scan again", "สแกนอีกครั้ง")}</button>
              </>
            ) : (
              <>
                <div className="text-4xl mb-2 flex justify-center" style={{ color: "var(--bad-fg)" }}><X /></div>
                <div className="font-bold text-lg" style={{ color: "var(--bad-fg)" }}>{L("Scan Failed", "สแกนไม่สำเร็จ")}</div>
                <div className="text-sm mt-2 mb-5" style={{ color: "var(--muted)" }}>{result.reason}</div>
                {tooManyRetries ? (
                  <>
                    <button className="btn btn-primary w-full mb-2" onClick={() => { setResult(null); setManual(true); }}>{L("Enter Manually", "กรอกด้วยตนเอง")}</button>
                    <button className="btn btn-ghost w-full" onClick={onCancel}>{L("Cancel", "ยกเลิก")}</button>
                  </>
                ) : (
                  <>
                    <button className="btn w-full mb-2" style={{ background: "#ef4444", color: "#fff" }} onClick={() => setResult(null)}>{L("Retry", "ลองใหม่")}</button>
                    <button className="btn btn-ghost w-full mb-2" onClick={() => { setResult(null); setManual(true); }}>{L("Enter Manually", "กรอกด้วยตนเอง")}</button>
                    <button className="btn btn-ghost w-full" onClick={onCancel}>{L("Cancel", "ยกเลิก")}</button>
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

function IqcPanel({ task, onDone }: { task: Task; onDone: () => void }) {
  const L = useL();
  const total = task.actualQty ?? 0;
  const [passedQty, setPassedQty] = useState(String(total));
  const [defectReason, setDefectReason] = useState("");
  const [inspector, setInspector] = useState(getUser()?.username ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const passed = Math.max(0, Math.min(Number(passedQty) || 0, total));
  const failed = total - passed;

  async function submit(judgment: "PASS" | "FAIL") {
    setErr(""); setBusy(true);
    try {
      if (judgment === "PASS") {
        await api.iqcPass(task.id, { passedQty: passed, failedQty: failed, inspector: inspector || undefined });
      } else {
        await api.iqcFail(task.id, { passedQty: passed, failedQty: failed, defectReason, inspector: inspector || undefined });
      }
      onDone();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4 font-bold">
        <Flask style={{ color: "var(--primary)" }} /> {L("IQC Inspection", "ตรวจสอบ IQC")}
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <Labeled label={L("Total Received", "รับทั้งหมด")}>
          <input className="field" value={total} readOnly />
        </Labeled>
        <Labeled label={L("Passed Qty", "ผ่าน")}>
          <input className="field" type="number" min={0} max={total}
            value={passedQty} onChange={(e) => setPassedQty(e.target.value)} />
        </Labeled>
        <Labeled label={L("Failed Qty", "ไม่ผ่าน")}>
          <input className="field" value={failed} readOnly />
        </Labeled>
      </div>
      <Labeled label={L("Defect Reason", "เหตุผลที่ไม่ผ่าน")} className="mt-4">
        <textarea className="field" rows={2} value={defectReason}
          onChange={(e) => setDefectReason(e.target.value)}
          placeholder={L("Required when failing", "ต้องระบุเมื่อไม่ผ่าน")} />
      </Labeled>
      <Labeled label={L("Inspector", "ผู้ตรวจสอบ")} className="mt-4">
        <input className="field" value={inspector} onChange={(e) => setInspector(e.target.value)} />
      </Labeled>
      {err && <div className="badge badge-bad mt-4 w-full justify-center py-1.5">{err}</div>}
      <div className="flex gap-3 mt-5">
        <button className="btn flex-1 font-semibold" disabled={busy}
          style={{ background: "#16a34a", color: "#fff" }}
          onClick={() => submit("PASS")}>
          {busy ? "…" : L("Pass", "ผ่าน")}
        </button>
        <button className="btn flex-1 font-semibold" disabled={busy || !defectReason.trim()}
          style={{ background: "#dc2626", color: "#fff" }}
          onClick={() => submit("FAIL")}>
          {busy ? "…" : L("Fail", "ไม่ผ่าน")}
        </button>
      </div>
    </Card>
  );
}

function DonePanel({ task }: { task: Task }) {
  const L = useL();
  const failed = task.status === "REJECTED" || task.judgment === "FAIL";
  if (failed) {
    return (
      <Card className="text-center">
        <div className="text-4xl mb-2 flex justify-center" style={{ color: "var(--bad-fg)" }}><X /></div>
        <div className="font-bold" style={{ color: "var(--bad-fg)" }}>{L("IQC Failed", "IQC ไม่ผ่าน")}</div>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          {L("Rejected", "ถูกปฏิเสธ")}{task.failedQty != null ? L(` — ${task.failedQty} pcs failed`, ` — ไม่ผ่าน ${task.failedQty} ชิ้น`) : ""}.
          {task.defectReason ? L(` Reason: ${task.defectReason}`, ` เหตุผล: ${task.defectReason}`) : ""}
        </p>
      </Card>
    );
  }
  const stored = task.status === "COMPLETED" && task.targetLocation;
  return (
    <Card className="text-center">
      <div className="text-4xl mb-2 flex justify-center" style={{ color: "var(--ok-fg)" }}><Check /></div>
      <div className="font-bold">{stored ? L("Completed", "เสร็จสิ้น") : L("IQC Passed — Done", "IQC ผ่าน — เสร็จสิ้น")}</div>
      <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
        {stored
          ? <>{L("Stored in rack", "เก็บเข้า rack")} <Link href={`/bin/${encodeURIComponent(task.targetLocation!)}`} className="font-bold underline">{task.targetLocation}</Link>. {L("AS400 queue row written.", "บันทึกคิว AS400 แล้ว")}</>
          : <>{L(`Passed IQC (${task.passedQty ?? task.actualQty} pcs). Receipt complete — AS400 queue updated.`, `IQC ผ่าน (${task.passedQty ?? task.actualQty} ชิ้น) การรับเสร็จสิ้น — อัปเดตคิว AS400 แล้ว`)}</>}
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
