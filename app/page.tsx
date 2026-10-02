"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/app/components/AppShell";
import { Download, Box, List } from "@/app/components/icons";
import { api } from "@/lib/client";
import { useLang } from "@/lib/lang";

// ponytail: edit this array to update announcements — no API needed
const ANNOUNCEMENTS: { en: string; th: string; type?: "info" | "warn" }[] = [
  { en: "Inventory count scheduled: 10 Oct 2026", th: "นับสต็อก: 10 ต.ค. 2569", type: "warn" },
  { en: "New parts incoming: PCB Assembly (Lot #A2214)", th: "อะไหล่ใหม่เข้า: PCB Assembly (Lot #A2214)", type: "info" },
  { en: "System maintenance: 5 Oct 2026 00:00–02:00", th: "บำรุงรักษาระบบ: 5 ต.ค. 2569 00:00–02:00", type: "info" },
];

type DashData = { pending: number; iqc: number; completed: number; totalParts: number; inStock: number; belowSafety: number };

const NAV_TILES = [
  { href: "/receive", key: "receive" as const, Icon: Download, color: "#2563eb" },
  { href: "/parts",   key: "parts"   as const, Icon: Box,      color: "#059669" },
  { href: "/track",   key: "track"   as const, Icon: List,     color: "#d97706" },
];

function Stat({ label, value, warn }: { label: string; value: number | undefined; warn?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border py-4 px-3 gap-1"
      style={{ background: "var(--card)", borderColor: warn && value ? "#dc2626" : "var(--border)" }}>
      <span className="text-2xl font-bold" style={{ color: warn && value ? "#dc2626" : "var(--fg)" }}>
        {value ?? "—"}
      </span>
      <span className="text-xs text-center leading-tight" style={{ color: "var(--muted)" }}>{label}</span>
    </div>
  );
}

export default function HomePage() {
  const { t, lang } = useLang();
  const [data, setData] = useState<DashData | null>(null);
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    api.getDashboard().then(setData).catch(() => {});
  }, []);

  useEffect(() => {
    if (ANNOUNCEMENTS.length < 2) return;
    const id = setInterval(() => {
      setSlide(s => (s + 1) % ANNOUNCEMENTS.length);
    }, 4000);
    return () => clearInterval(id);
  }, []);

  const th = lang === "th";
  const ann = ANNOUNCEMENTS[slide];

  return (
    <AppShell title="Dashboard" active="home">
      <div className="max-w-lg mx-auto pt-4 lg:pt-8 flex flex-col gap-6">

        {/* Announcements banner */}
        {ANNOUNCEMENTS.length > 0 && (
          <section className="rounded-xl border overflow-hidden" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between px-4 py-2 text-xs font-semibold uppercase tracking-wide"
              style={{ background: "var(--accent,#2563eb)", color: "#fff" }}>
              <span>{th ? "ประกาศ" : "Announcements"}</span>
              <span style={{ opacity: 0.7 }}>{slide + 1} / {ANNOUNCEMENTS.length}</span>
            </div>
            <div key={slide} className="ann-slide flex items-start gap-2 px-4 py-3 text-sm" style={{ minHeight: "3rem" }}>
              <span className="mt-0.5 shrink-0 text-base">{ann.type === "warn" ? "⚠️" : "📢"}</span>
              <span style={{ color: "var(--fg)" }}>{th ? ann.th : ann.en}</span>
            </div>
            <div className="flex gap-1.5 justify-center pb-2">
              {ANNOUNCEMENTS.map((_, i) => (
                <button key={i} onClick={() => setSlide(i)}
                  className="rounded-full transition-all"
                  style={{ width: i === slide ? 16 : 6, height: 6, background: i === slide ? "var(--accent,#2563eb)" : "var(--border)" }} />
              ))}
            </div>
          </section>
        )}

        {/* Task stats */}
        <section>
          <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--muted)" }}>
            {th ? "งานรับสินค้า" : "Inbound Tasks"}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Stat label={th ? "รอรับ" : "Pending"} value={data?.pending} />
            <Stat label={th ? "รอ IQC" : "IQC Queue"} value={data?.iqc} warn />
            <Stat label={th ? "เสร็จสิ้น" : "Completed"} value={data?.completed} />
          </div>
        </section>

        {/* Parts stats */}
        <section>
          <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--muted)" }}>
            {th ? "ชิ้นส่วน" : "Parts"}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Stat label={th ? "ทั้งหมด" : "Total"} value={data?.totalParts} />
            <Stat label={th ? "มีสต็อก" : "In Stock"} value={data?.inStock} />
            <Stat label={th ? "ต่ำกว่าขั้นต่ำ" : "Below Safety"} value={data?.belowSafety} warn />
          </div>
        </section>

        {/* Nav tiles */}
        <section>
          <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--muted)" }}>
            {th ? "เมนู" : "Menu"}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {NAV_TILES.map(({ href, key, Icon, color }) => (
              <Link key={key} href={href}
                className="flex flex-col items-center gap-3 rounded-xl border py-5 text-center transition-opacity active:opacity-60"
                style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                <span className="text-2xl" style={{ color }}><Icon /></span>
                <span className="text-xs font-semibold">{t.nav[key]}</span>
              </Link>
            ))}
          </div>
        </section>

      </div>
    </AppShell>
  );
}
