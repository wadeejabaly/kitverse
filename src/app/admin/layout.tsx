import type { Metadata, Viewport } from "next";
import { FONT_CLASS_NAMES } from "@/lib/fonts";
import "./admin.css";

export const metadata: Metadata = {
  title: { default: "Kitverse Admin", template: "%s · Kitverse Admin" },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Kitverse", statusBarStyle: "black" },
};
export const viewport: Viewport = { themeColor: "#050914", width: "device-width", initialScale: 1, viewportFit: "cover" };

/**
 * Root layout of the owner admin (the storefront has its own under [locale]).
 * Same typefaces as the storefront (Changa for text, Reem Kufi for display -
 * self-hosted, src/lib/fonts.ts), on the admin's own dark navy tokens (admin.css).
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" className={`${FONT_CLASS_NAMES} antialiased`}>
      <body className="admin-theme admin-glow min-h-dvh text-ink">{children}</body>
    </html>
  );
}
