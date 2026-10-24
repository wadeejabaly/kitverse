import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import "../admin/admin.css";

const arabic = IBM_Plex_Sans_Arabic({ subsets: ["arabic", "latin"], weight: ["400", "500", "600", "700"], variable: "--font-ar" });

export const metadata: Metadata = { title: "طلبيتك · Kitverse", robots: { index: false, follow: false } };
export const viewport: Viewport = { themeColor: "#f5f3ef", width: "device-width", initialScale: 1, viewportFit: "cover" };

/** Customer-facing order page: store palette (warm paper, ink, pitch green), Arabic, right-to-left. */
export default function OrderLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${arabic.variable} antialiased`}>
      <body className="min-h-dvh bg-paper text-ink" style={{ fontFamily: "var(--font-ar), system-ui, sans-serif" }}>{children}</body>
    </html>
  );
}
