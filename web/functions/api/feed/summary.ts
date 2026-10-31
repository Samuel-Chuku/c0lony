import { summary } from "../../_lib/handlers.ts";
import { fallback, route } from "../../_lib/route.ts";

export const onRequestGet = route("GET", summary);
export const onRequest = fallback;
