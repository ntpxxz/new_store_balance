"use client";

import { useState } from "react";
import AppShell from "@/app/components/AppShell";
import { Plus } from "@/app/components/icons";
import { Th, Td, Info } from "@/app/components/table";
import { api, type UserRow } from "@/lib/client";
import { useLang } from "@/lib/lang";

// must match createUserSchema / updateUserSchema in lib/validation.ts
const ROLES = ["ADMIN", "SUPERVISOR", "USER"];
const SECTIONS = ["IQC", "WAREHOUSE", "PRODUCTION", "PLANNING", "PURCHASING"];
const EMPTY = { username: "", password: "", email: "", role: "USER", section: "IQC" };

export default function SettingsClient({ meId, initialUsers }: { meId: string; initialUsers: UserRow[] }) {
  const { lang } = useLang();
  const L = (en: string, th: string) => (lang === "th" ? th : en);
  const [users, setUsers] = useState(initialUsers);
  const [form, setForm] = useState(EMPTY);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await fn(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const update = (u: UserRow, body: Parameters<typeof api.updateUser>[1]) =>
    run(async () => {
      const saved = await api.updateUser(u.id, body);
      setUsers(us => us.map(x => (x.id === saved.id ? saved : x)));
    });

  const resetPassword = (u: UserRow) => {
    // ponytail: native prompt — internal LAN tool; swap for a modal if it matters
    const password = prompt(L(`New password for ${u.username} (min 4 chars)`, `รหัสผ่านใหม่ของ ${u.username} (อย่างน้อย 4 ตัว)`));
    if (password) update(u, { password });
  };

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const saved = await api.createUser({ ...form, email: form.email || null });
      setUsers(us => [...us, saved].sort((a, b) => a.username.localeCompare(b.username)));
      setForm(EMPTY); setAdding(false);
    });
  };

  return (
    <AppShell title={L("Settings", "ตั้งค่า")} active="settings">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">{L("Users", "ผู้ใช้งาน")} <span className="text-sm font-normal" style={{ color: "var(--muted)" }}>({users.length})</span></h2>
          <button className="btn btn-primary" onClick={() => setAdding(a => !a)}>
            <Plus /> {L("Add user", "เพิ่มผู้ใช้")}
          </button>
        </div>

        {error && <Info bad>{error}</Info>}

        {adding && (
          <form onSubmit={create} className="card p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 items-end">
            <input className="field" required minLength={2} placeholder={L("Username", "ชื่อผู้ใช้")} autoComplete="off"
              value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} />
            <input className="field" required minLength={4} type="password" placeholder={L("Password", "รหัสผ่าน")} autoComplete="new-password"
              value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
            <input className="field" type="email" placeholder={L("Email (optional)", "อีเมล (ไม่บังคับ)")}
              value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            <div className="flex gap-2">
              <select className="field" aria-label="Role" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                {ROLES.map(r => <option key={r}>{r}</option>)}
              </select>
              <select className="field" aria-label="Section" value={form.section} onChange={e => setForm({ ...form, section: e.target.value })}>
                {SECTIONS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <button className="btn btn-accent" disabled={busy}>{L("Save", "บันทึก")}</button>
          </form>
        )}

        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left" style={{ color: "var(--muted)" }}>
              <tr>
                <Th>{L("Username", "ชื่อผู้ใช้")}</Th>
                <Th>{L("Email", "อีเมล")}</Th>
                <Th>Role</Th>
                <Th>Section</Th>
                <Th>{L("Active", "ใช้งาน")}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const me = u.id === meId;
                return (
                  <tr key={u.id} className="border-t" style={{ borderColor: "var(--border)", opacity: u.isActive ? 1 : 0.5 }}>
                    <Td className="font-semibold">{u.username}{me && <span className="ml-1.5 text-xs font-normal" style={{ color: "var(--muted)" }}>({L("you", "คุณ")})</span>}</Td>
                    <Td style={{ color: "var(--muted)" }}>{u.email ?? "—"}</Td>
                    <Td>
                      <select className="field py-1" aria-label={`Role of ${u.username}`} value={u.role} disabled={busy || me}
                        onChange={e => update(u, { role: e.target.value })}>
                        {ROLES.map(r => <option key={r}>{r}</option>)}
                      </select>
                    </Td>
                    <Td>
                      <select className="field py-1" aria-label={`Section of ${u.username}`} value={u.section} disabled={busy}
                        onChange={e => update(u, { section: e.target.value })}>
                        {/* keep legacy values visible if the DB has one outside the list */}
                        {(SECTIONS.includes(u.section) ? SECTIONS : [u.section, ...SECTIONS]).map(s => <option key={s}>{s}</option>)}
                      </select>
                    </Td>
                    <Td>
                      <input type="checkbox" className="w-4 h-4" aria-label={`Active ${u.username}`} checked={u.isActive} disabled={busy || me}
                        onChange={e => update(u, { isActive: e.target.checked })} />
                    </Td>
                    <Td className="text-right">
                      <button className="btn btn-ghost py-1.5 text-xs" disabled={busy} onClick={() => resetPassword(u)}>
                        {L("Reset password", "รีเซ็ตรหัสผ่าน")}
                      </button>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
