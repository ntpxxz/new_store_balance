"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/client";

export default function LoginPage() {
  const router = useRouter();
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
      <form onSubmit={submit} className="card w-full max-w-sm p-6">
        <div className="text-xl font-extrabold tracking-tight">FORM INVENTORY</div>
        <div className="text-xs mb-6" style={{ color: "var(--muted)" }}>Receive Module — sign in</div>

        <label className="block text-sm font-medium mb-1">Username</label>
        <input className="field mb-4" value={username} onChange={(e) => setU(e.target.value)} autoFocus autoComplete="username" />

        <label className="block text-sm font-medium mb-1">Password</label>
        <input className="field mb-4" type="password" value={password} onChange={(e) => setP(e.target.value)} autoComplete="current-password" />

        {err && <div className="badge badge-bad mb-4 w-full justify-center py-1.5">{err}</div>}

        <button className="btn btn-primary w-full" disabled={busy || !username || !password}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
