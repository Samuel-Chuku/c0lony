import { tgWebhook } from "../../_lib/telegram.ts";
import { fallback, route } from "../../_lib/route.ts";

export const onRequestPost = route("POST", tgWebhook);
export const onRequest = fallback;
