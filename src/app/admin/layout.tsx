import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./admin.css";

const sans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Kitverse Admin", template: "%s · Kitverse Admin" },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Kitverse", statusBarStyle: "black" },
};
export const viewport: Viewport = { themeColor: "#000000", width: "device-width", initialScale: 1, viewportFit: "cover" };

/** Root layout of the owner admin (the storefront has its own under [locale]). */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" className={`${sans.variable} ${mono.variable} antialiased`}>
      <body className="admin-theme min-h-dvh bg-void text-ink">{children}</body>
    </html>
  );
}
