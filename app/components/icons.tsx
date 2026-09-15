// Minimal inline icons (stroke=currentColor) — ponytail: no icon dependency.
type P = { className?: string; style?: React.CSSProperties };
const s = (d: string) => ({ className, style }: P) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width="1em" height="1em">
    {d.split("|").map((p, i) => <path key={i} d={p} />)}
  </svg>
);
export const Home = s("M3 11l9-8 9 8|M5 10v10h5v-6h4v6h5V10");
export const Download = s("M12 3v12|M7 11l5 5 5-5|M4 21h16");
export const Upload = s("M12 21V9|M7 13l5-5 5 5|M4 3h16");
export const Box = s("M21 8l-9-5-9 5 9 5 9-5z|M3 8v8l9 5 9-5V8|M12 13v8");
export const Circle = s("M12 21a9 9 0 100-18 9 9 0 000 18z|M12 15a3 3 0 100-6 3 3 0 000 6z");
export const Search = s("M11 19a8 8 0 100-16 8 8 0 000 16z|M21 21l-4-4");
export const ChevronLeft = s("M15 18l-6-6 6-6");
export const ChevronRight = s("M9 18l6-6-6-6");
export const Refresh = s("M21 12a9 9 0 11-3-6.7L21 8|M21 3v5h-5");
export const Sync = s("M3 12a9 9 0 019-9 8.9 8.9 0 016.3 2.6|M21 4v5h-5|M21 12a9 9 0 01-9 9 8.9 8.9 0 01-6.3-2.6|M3 20v-5h5");
export const Db = s("M12 8c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3z|M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5");
export const Barcode = s("M4 6v12|M8 6v12|M11 6v12|M14 6v12|M17 6v12|M20 6v12");
export const Check = s("M20 6L9 17l-5-5");
export const X = s("M18 6L6 18|M6 6l12 12");
export const Flask = s("M9 3h6|M10 3v6l-5 9a1 1 0 001 1h12a1 1 0 001-1l-5-9V3|M8 14h8");
export const Monitor = s("M4 4h16a1 1 0 011 1v11a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1z|M8 21h8|M12 17v4");
