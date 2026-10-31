import { profile } from "../_lib/handlers.ts";
import { fallback, route } from "../_lib/route.ts";

export const onRequestPost = route("POST", profile);
export const onRequest = fallback;
