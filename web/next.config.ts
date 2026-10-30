import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

// Static export for Cloudflare Pages: `next build` writes plain files to web/out. No Node server; server code
// lives only in web/functions as Cloudflare Pages Functions.
const config: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  // Lets the landing and app dev servers run side by side without sharing a build folder.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Pin the workspace root to web/ so stray lockfiles in parent folders are ignored.
  turbopack: { root: fileURLToPath(new URL(".", import.meta.url)) },
};

export default config;
