import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@fontsource/jersey-10/latin-400.css";
import "@fontsource/dotgothic16/latin-400.css";
import "@fontsource/gaegu/latin-700.css";
import "./tokens.css";
import "../ui/ui.css";
import { BRAND, SITE, SITE_URL } from "../brand";
import { Providers } from "../shell/Providers";

const title = SITE === "app" ? `Play · ${BRAND.name}` : BRAND.name;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: title, template: `%s · ${BRAND.name}` },
  description: BRAND.tagline,
  applicationName: BRAND.name,
  alternates: { canonical: "/" },
  icons: { icon: { url: BRAND.favicon, sizes: "32x32", type: "image/png" }, apple: BRAND.appleTouchIcon },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: BRAND.name, statusBarStyle: "black-translucent" },
  openGraph: { type: "website", siteName: BRAND.name, title, description: BRAND.tagline, url: "/" },
  twitter: { card: "summary", title, description: BRAND.tagline },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#24180F" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{SITE === "app" ? <Providers>{children}</Providers> : children}</body>
    </html>
  );
}
