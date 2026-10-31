import { ingest } from "../../_lib/handlers.ts";
import { fallback, route } from "../../_lib/route.ts";

export const onRequestPost = route("POST", ingest);
export const onRequest = fallback;
