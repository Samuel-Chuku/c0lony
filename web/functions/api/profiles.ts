import { profiles } from "../_lib/handlers.ts";
import { fallback, route } from "../_lib/route.ts";

export const onRequestGet = route("GET", profiles);
export const onRequest = fallback;
