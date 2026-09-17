import type { ReactNode } from "react";

export const Th = ({ children, className = "" }: { children?: ReactNode; className?: string }) =>
  <th className={`px-4 py-3 font-medium ${className}`}>{children}</th>;

export const Td = ({ children, className = "", style }: { children?: ReactNode; className?: string; style?: React.CSSProperties }) =>
  <td className={`px-4 py-4 ${className}`} style={style}>{children}</td>;

export function Info({ children, bad }: { children: ReactNode; bad?: boolean }) {
  return <div className="card p-8 text-center text-sm" style={{ color: bad ? "var(--bad-fg)" : "var(--muted)" }}>{children}</div>;
}
