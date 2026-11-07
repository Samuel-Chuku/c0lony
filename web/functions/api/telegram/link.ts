import { tgLink } from "../../_lib/telegram.ts";
import { fallback, route } from "../../_lib/route.ts";

export const onRequestPost = route("POST", tgLink);
export const onRequest = fallback;
