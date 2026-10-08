"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/client";
import { useLang } from "@/lib/lang";
import { useTheme } from "@/lib/theme";

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { t, lang, setLang } = useLang();
  const { theme, toggle: toggleTheme } = useTheme();
  const [username, setU] = useState("");
  const [password, setP] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await login(username.trim(), password);
      router.replace("/receive");
    } catch (e: any) {
      setErr(e.message || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      {/* Theme + lang toggles */}
      <div className="fixed top-4 right-4 flex items-center gap-2">
        <button onClick={() => setLang(lang === "en" ? "th" : "en")}
          className="text-xs font-bold px-2 py-1 rounded-md border"
          style={{ borderColor: "var(--border)", color: "var(--muted)", background: "transparent" }}>
          {lang === "en" ? "TH" : "EN"}
        </button>
        <button onClick={toggleTheme} className="p-1.5 rounded-md border"
          style={{ borderColor: "var(--border)", color: "var(--muted)", background: "transparent" }}>
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>

      <form onSubmit={submit} className="card w-full max-w-sm p-6">
        <div className="text-xl font-extrabold tracking-tight">SPD-STOREHOUSE</div>
        <div className="text-xs mb-6" style={{ color: "var(--muted)" }}>{t.login.subtitle}</div>

        <label className="block text-sm font-medium mb-1">{t.login.username}</label>
        <input className="field mb-4" value={username} onChange={(e) => setU(e.target.value)} autoFocus autoComplete="username" />

        <label className="block text-sm font-medium mb-1">{t.login.password}</label>
        <input className="field mb-4" type="password" value={password} onChange={(e) => setP(e.target.value)} autoComplete="current-password" />

        {err && <div className="badge badge-bad mb-4 w-full justify-center py-1.5">{err}</div>}

        <button className="btn btn-primary w-full" disabled={busy || !username || !password}>
          {busy ? t.login.signingIn : t.login.signin}
        </button>
      </form>
    </div>
  );
}
