"use client";
import { ThemeProvider } from "@/lib/theme";
import { LangProvider } from "@/lib/lang";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <LangProvider>{children}</LangProvider>
    </ThemeProvider>
  );
}
