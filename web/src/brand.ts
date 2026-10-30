// Brand values in one place. The logo and favicon are files under public/brand/, so swapping them needs no code change.
export const BRAND = {
  name: "C0LONY", // display text; the "0" is a zero
  slug: "c0lony", // lowercase contexts
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://c0lony.xyz",
  tagline: "An onchain ant-colony strategy game. Feed the queen, raid rivals, win the $WIF season pot.",
  favicon: "/brand/favicon.svg",
} as const;
