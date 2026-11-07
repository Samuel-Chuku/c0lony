import { tgPrefs } from "../../_lib/telegram.ts";
import { fallback, route } from "../../_lib/route.ts";

export const onRequestPost = route("POST", tgPrefs);
export const onRequest = fallback;
