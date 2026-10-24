import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: { default: "Kitverse Admin", template: "%s · Kitverse Admin" },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Kitverse", statusBarStyle: "black" },
};
export const viewport: Viewport = { themeColor: "#000000", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div dir="ltr" lang="en" className="admin-theme min-h-dvh bg-void text-ink">{children}</div>;
}
