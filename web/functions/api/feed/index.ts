import { feed } from "../../_lib/handlers.ts";
import { fallback, route } from "../../_lib/route.ts";

export const onRequestGet = route("GET", feed);
export const onRequest = fallback;
