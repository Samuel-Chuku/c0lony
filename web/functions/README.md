Cloudflare Pages Functions. The only server code in the web app; everything else is a static export in `out/`.
Files here map to routes, e.g. `functions/api/rpc.ts` serves `/api/rpc`. Secrets they need are set as
encrypted variables in the Pages project, never as build variables.
