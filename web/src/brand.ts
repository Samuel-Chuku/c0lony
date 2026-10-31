// Brand values in one place. The logo, icons and favicon are files under public/, so swapping them needs no code change.
export const BRAND = {
  name: "C0LONY", // display text; the "0" is a zero
  slug: "c0lony", // lowercase contexts
  tagline: "An onchain ant-colony strategy game. Feed the queen, raid rivals, win the $WIF season pot.",
  favicon: "/icon-32.png",
  appleTouchIcon: "/icon-180.png",
  logo: "/logo.svg",
  logoCompact: "/logo-compact.svg",
} as const;

// One codebase, two static sites, picked at build time by NEXT_PUBLIC_SITE:
//   landing -> https://c0lony.xyz      (what the game is, how it works)
//   app     -> https://app.c0lony.xyz  (connect a wallet and play)
export const SITE: "landing" | "app" = process.env.NEXT_PUBLIC_SITE === "app" ? "app" : "landing";
export const LANDING_URL = process.env.NEXT_PUBLIC_LANDING_URL || "https://c0lony.xyz";
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.c0lony.xyz";
export const SITE_URL = SITE === "app" ? APP_URL : LANDING_URL;
