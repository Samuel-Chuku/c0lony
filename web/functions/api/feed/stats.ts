import { stats } from "../../_lib/handlers.ts";
import { fallback, route } from "../../_lib/route.ts";

export const onRequestGet = route("GET", stats);
export const onRequest = fallback;
