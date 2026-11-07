import { tgTargets } from "../../_lib/telegram.ts";
import { fallback, route } from "../../_lib/route.ts";

export const onRequestPost = route("POST", tgTargets);
export const onRequest = fallback;
