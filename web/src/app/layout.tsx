import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { BRAND } from "../brand";

export const metadata: Metadata = {
  metadataBase: new URL(BRAND.url),
  title: { default: BRAND.name, template: `%s · ${BRAND.name}` },
  description: BRAND.tagline,
  applicationName: BRAND.name,
  alternates: { canonical: "/" },
  icons: { icon: BRAND.favicon },
  openGraph: { type: "website", siteName: BRAND.name, title: BRAND.name, description: BRAND.tagline, url: "/" },
  twitter: { card: "summary", title: BRAND.name, description: BRAND.tagline },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#3b2a1e" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
