import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "@/app/components/Providers";

export const metadata: Metadata = {
  title: "Receive — Form Inventory",
  description: "Inbound receive module",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Anti-flash: apply saved theme before React hydrates */}
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('theme');if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}` }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
