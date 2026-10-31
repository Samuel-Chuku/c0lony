import { pushPrefs } from "../../_lib/handlers.ts";
import { fallback, route } from "../../_lib/route.ts";

export const onRequestPost = route("POST", pushPrefs);
export const onRequest = fallback;
