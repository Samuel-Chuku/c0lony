import { tgPrune } from "../../_lib/telegram.ts";
import { fallback, route } from "../../_lib/route.ts";

export const onRequestPost = route("POST", tgPrune);
export const onRequest = fallback;
