"use client";

import { useEffect, useRef, useState } from "react";
import AppShell from "@/app/components/AppShell";
import { Plus, Search, X } from "@/app/components/icons";
import { Info } from "@/app/components/table";
import { api, type UserRow } from "@/lib/client";
import { useLang } from "@/lib/lang";

// must match createUserSchema / updateUserSchema in lib/validation.ts
const ROLES = ["ADMIN", "SUPERVISOR", "USER"];
const SECTIONS = ["IQC", "WAREHOUSE", "PRODUCTION", "PLANNING", "PURCHASING"];
// literal class strings — Tailwind cannot see classes built at runtime
const COLS = "lg:grid-cols-[minmax(0,2fr)_9rem_9rem_5rem_auto]";
const EMPTY = { username: "", password: "", empId: "", role: "USER", section: "IQC" };
const ROLE_STYLE: Record<string, { background: string; color: string }> = {
  ADMIN: { background: "var(--bad-bg)", color: "var(--bad-fg)" },
  SUPERVISOR: { background: "var(--warn-bg)", color: "var(--warn-fg)" },
  USER: { background: "var(--primary-tint)", color: "var(--primary)" },
};

type Toast = { msg: string; bad?: boolean } | null;

export default function SettingsClient({ meId, initialUsers }: { meId: string; initialUsers: UserRow[] }) {
  const { lang } = useLang();
  const L = (en: string, th: string) => (lang === "th" ? th : en);
  const [users, setUsers] = useState(initialUsers);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<string | null>(null); // row id being saved, or "new"
  const [toast, setToast] = useState<Toast>(null);
  const [adding, setAdding] = useState(false);
  const [pwFor, setPwFor] = useState<UserRow | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), toast.bad ? 5000 : 2500);
    return () => clearTimeout(id);
  }, [toast]);

  const run = async (key: string, fn: () => Promise<void>, ok: string) => {
    setPending(key);
    try { await fn(); setToast({ msg: ok }); return true; }
    catch (e: any) { setToast({ msg: e.message, bad: true }); return false; }
    finally { setPending(null); }
  };

  const update = (u: UserRow, body: Parameters<typeof api.updateUser>[1], ok = L("Saved", "บันทึกแล้ว")) =>
    run(u.id, async () => {
      const saved = await api.updateUser(u.id, body);
      setUsers(us => us.map(x => (x.id === saved.id ? saved : x)));
    }, ok);

  const toggleActive = (u: UserRow) => {
    if (u.isActive && !confirm(L(`Deactivate ${u.username}? They will be logged out immediately.`, `ปิดการใช้งาน ${u.username}? ผู้ใช้จะถูกออกจากระบบทันที`))) return;
    update(u, { isActive: !u.isActive }, u.isActive ? L("Deactivated", "ปิดการใช้งานแล้ว") : L("Activated", "เปิดการใช้งานแล้ว"));
  };

  const q = query.trim().toLowerCase();
  const shown = q ? users.filter(u => `${u.username} ${u.empId ?? ""} ${u.role} ${u.section}`.toLowerCase().includes(q)) : users;
  const activeCount = users.filter(u => u.isActive).length;

  return (
    <AppShell title={L("Settings", "ตั้งค่า")} active="settings">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">{L("Users", "ผู้ใช้งาน")}</h2>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              {L(`${activeCount} active · ${users.length - activeCount} inactive`, `ใช้งาน ${activeCount} · ปิด ${users.length - activeCount}`)}
            </p>
          </div>
          <button className="btn btn-primary shrink-0" onClick={() => setAdding(true)}>
            <Plus /> <span className="hidden sm:inline">{L("Add user", "เพิ่มผู้ใช้")}</span>
            <span className="sm:hidden">{L("Add", "เพิ่ม")}</span>
          </button>
        </div>

        <div className="relative">
          <input className="field pr-9" placeholder={L("Search name, EmpID, role, section", "ค้นหาชื่อ รหัสพนักงาน role section")}
            value={query} onChange={e => setQuery(e.target.value)} />
          {/* right side like /receive: magnifier when empty, clear when typing (filter is live) */}
          {query ? (
            <button className="absolute right-2.5 top-2 p-0.5" aria-label={L("Clear", "ล้าง")} onClick={() => setQuery("")}
              style={{ color: "var(--muted)" }}><X className="text-lg" /></button>
          ) : (
            <span className="absolute right-2.5 top-2 p-0.5 pointer-events-none" style={{ color: "var(--muted)" }}>
              <Search className="text-lg" />
            </span>
          )}
        </div>

        {shown.length === 0 ? (
          <Info>{L("No users match", "ไม่พบผู้ใช้")}</Info>
        ) : (
          // one markup: stacked card per user on mobile, grid row on lg
          <div className="card divide-y overflow-hidden" style={{ borderColor: "var(--border)" }}>
            <div className={`hidden lg:grid ${COLS} gap-x-3 px-4 py-2.5 text-xs font-medium uppercase tracking-wide`}
              style={{ color: "var(--muted)", background: "var(--table-head)" }}>
              <div>{L("User", "ผู้ใช้")}</div>
              <div>Role</div>
              <div>Section</div>
              <div>{L("Active", "ใช้งาน")}</div>
              <div />
            </div>
            {shown.map(u => {
              const me = u.id === meId;
              const saving = pending === u.id;
              return (
                <div key={u.id} className={`grid grid-cols-2 ${COLS} gap-x-3 gap-y-3 items-center px-4 py-3.5 text-sm transition-opacity`}
                  style={{ borderColor: "var(--border)", opacity: saving ? 0.6 : 1 }} aria-busy={saving}>
                  <div className="flex items-center gap-3 min-w-0" style={{ opacity: u.isActive ? 1 : 0.55 }}>
                    <span className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center font-bold uppercase"
                      style={ROLE_STYLE[u.role] ?? ROLE_STYLE.USER}>{u.username.slice(0, 1)}</span>
                    <div className="min-w-0">
                      <div className="font-semibold truncate">
                        {u.username}
                        {me && <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded align-middle"
                          style={{ background: "var(--primary-tint)", color: "var(--primary)" }}>{L("YOU", "คุณ")}</span>}
                      </div>
                      <div className="text-xs truncate" style={{ color: "var(--muted)" }}>{u.empId ?? L("No EmpID", "ไม่มีรหัสพนักงาน")}</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end lg:justify-start gap-2 lg:order-4">
                    <span className="lg:hidden text-xs" style={{ color: "var(--muted)" }}>
                      {u.isActive ? L("Active", "ใช้งาน") : L("Inactive", "ปิดอยู่")}
                    </span>
                    <Switch on={u.isActive} disabled={saving || me} label={`${L("Active", "ใช้งาน")} ${u.username}`}
                      title={me ? L("You can't deactivate yourself", "ปิดบัญชีตัวเองไม่ได้") : undefined}
                      onClick={() => toggleActive(u)} />
                  </div>

                  <label className="lg:order-2">
                    <span className="lg:hidden block text-[11px] mb-1" style={{ color: "var(--muted)" }}>Role</span>
                    <select className="field py-1.5" value={u.role} disabled={saving || me}
                      title={me ? L("You can't change your own role", "เปลี่ยน role ตัวเองไม่ได้") : undefined}
                      onChange={e => update(u, { role: e.target.value })}>
                      {ROLES.map(r => <option key={r}>{r}</option>)}
                    </select>
                  </label>
                  <label className="lg:order-3">
                    <span className="lg:hidden block text-[11px] mb-1" style={{ color: "var(--muted)" }}>Section</span>
                    <select className="field py-1.5" value={u.section} disabled={saving}
                      onChange={e => update(u, { section: e.target.value })}>
                      {/* keep legacy values visible if the DB has one outside the list */}
                      {(SECTIONS.includes(u.section) ? SECTIONS : [u.section, ...SECTIONS]).map(s => <option key={s}>{s}</option>)}
                    </select>
                  </label>

                  <button className="btn btn-ghost py-1.5 text-xs col-span-2 lg:col-span-1 lg:order-5" disabled={saving}
                    onClick={() => setPwFor(u)}>
                    {L("Reset password", "รีเซ็ตรหัสผ่าน")}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add user */}
      <Sheet open={adding} onClose={() => setAdding(false)} title={L("Add user", "เพิ่มผู้ใช้")}>
        <AddUserForm L={L} busy={pending === "new"} onCancel={() => setAdding(false)}
          onSubmit={async form => {
            const ok = await run("new", async () => {
              const saved = await api.createUser({ ...form, empId: form.empId.trim() || null });
              setUsers(us => [...us, saved].sort((a, b) => a.username.localeCompare(b.username)));
            }, L(`Added ${form.username}`, `เพิ่ม ${form.username} แล้ว`));
            if (ok) setAdding(false);
          }} />
      </Sheet>

      {/* Reset password */}
      <Sheet open={!!pwFor} onClose={() => setPwFor(null)} title={L("Reset password", "รีเซ็ตรหัสผ่าน")}>
        {pwFor && (
          <PasswordForm L={L} username={pwFor.username} busy={pending === pwFor.id} onCancel={() => setPwFor(null)}
            onSubmit={async password => {
              if (await update(pwFor, { password }, L("Password updated", "เปลี่ยนรหัสผ่านแล้ว"))) setPwFor(null);
            }} />
        )}
      </Sheet>

      {toast && (
        <div role="status" className="fixed z-50 left-4 right-4 bottom-24 lg:bottom-6 lg:left-auto lg:right-6 lg:w-80 rounded-xl px-4 py-3 text-sm font-medium shadow-lg"
          style={toast.bad ? { background: "var(--bad-bg)", color: "var(--bad-fg)" } : { background: "var(--ok-bg)", color: "var(--ok-fg)" }}>
          {toast.msg}
        </div>
      )}
    </AppShell>
  );
}

type LFn = (en: string, th: string) => string;

function Switch({ on, disabled, label, title, onClick }: { on: boolean; disabled?: boolean; label: string; title?: string; onClick: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} title={title} disabled={disabled} onClick={onClick}
      className="relative w-11 h-6 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
      style={{ background: on ? "var(--ok-fg)" : "var(--border)" }}>
      <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
        style={{ transform: on ? "translateX(20px)" : "none" }} />
    </button>
  );
}

// ponytail: native <dialog> — focus trap, Esc and backdrop for free. Bottom sheet on mobile, centered on sm+.
function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} onClick={e => e.target === ref.current && onClose()}
      className="m-0 mt-auto w-full max-w-none sm:m-auto sm:max-w-md rounded-t-2xl sm:rounded-2xl p-0 backdrop:bg-black/40"
      style={{ background: "var(--card)", color: "var(--text)" }}>
      <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
        <h3 className="font-bold">{title}</h3>
        <button onClick={onClose} aria-label="Close" className="p-1" style={{ color: "var(--muted)" }}><X /></button>
      </div>
      <div className="p-5">{open && children}</div>
    </dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium mb-1" style={{ color: "var(--muted)" }}>{label}</span>
      {children}
    </label>
  );
}

function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  const { lang } = useLang();
  return (
    <div className="relative">
      <input {...props} type={show ? "text" : "password"} className="field pr-16" />
      <button type="button" onClick={() => setShow(s => !s)} className="absolute right-2 top-2 px-2 py-0.5 text-xs font-medium rounded"
        style={{ color: "var(--primary)" }} aria-pressed={show}>
        {lang === "th" ? (show ? "ซ่อน" : "แสดง") : (show ? "Hide" : "Show")}
      </button>
    </div>
  );
}

function AddUserForm({ L, busy, onCancel, onSubmit }: { L: LFn; busy: boolean; onCancel: () => void; onSubmit: (f: typeof EMPTY) => void }) {
  const [form, setForm] = useState(EMPTY);
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });
  return (
    <form className="space-y-3" onSubmit={e => { e.preventDefault(); onSubmit(form); }}>
      <Field label={L("Username", "ชื่อผู้ใช้")}>
        <input className="field" required minLength={2} autoComplete="off" autoFocus value={form.username} onChange={set("username")} />
      </Field>
      <Field label={L("Password (min 4)", "รหัสผ่าน (อย่างน้อย 4 ตัว)")}>
        <PasswordInput required minLength={4} autoComplete="new-password" value={form.password} onChange={set("password")} />
      </Field>
      <Field label={L("EmpID (optional)", "รหัสพนักงาน (ไม่บังคับ)")}>
        <input className="field" autoComplete="off" value={form.empId} onChange={set("empId")} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Role">
          <select className="field" value={form.role} onChange={set("role")}>{ROLES.map(r => <option key={r}>{r}</option>)}</select>
        </Field>
        <Field label="Section">
          <select className="field" value={form.section} onChange={set("section")}>{SECTIONS.map(s => <option key={s}>{s}</option>)}</select>
        </Field>
      </div>
      <div className="flex gap-2 pt-2">
        <button type="button" className="btn btn-ghost flex-1" onClick={onCancel}>{L("Cancel", "ยกเลิก")}</button>
        <button className="btn btn-primary flex-1" disabled={busy}>{busy ? L("Saving…", "กำลังบันทึก…") : L("Add user", "เพิ่มผู้ใช้")}</button>
      </div>
    </form>
  );
}

function PasswordForm({ L, username, busy, onCancel, onSubmit }: { L: LFn; username: string; busy: boolean; onCancel: () => void; onSubmit: (pw: string) => void }) {
  const [pw, setPw] = useState("");
  return (
    <form className="space-y-3" onSubmit={e => { e.preventDefault(); onSubmit(pw); }}>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        {L(`Set a new password for ${username}. They will be logged out of all devices.`, `ตั้งรหัสผ่านใหม่ให้ ${username} ผู้ใช้จะถูกออกจากระบบทุกเครื่อง`)}
      </p>
      <Field label={L("New password (min 4)", "รหัสผ่านใหม่ (อย่างน้อย 4 ตัว)")}>
        <PasswordInput required minLength={4} autoComplete="new-password" autoFocus value={pw} onChange={e => setPw(e.target.value)} />
      </Field>
      <div className="flex gap-2 pt-2">
        <button type="button" className="btn btn-ghost flex-1" onClick={onCancel}>{L("Cancel", "ยกเลิก")}</button>
        <button className="btn btn-primary flex-1" disabled={busy}>{busy ? L("Saving…", "กำลังบันทึก…") : L("Update password", "เปลี่ยนรหัสผ่าน")}</button>
      </div>
    </form>
  );
}
