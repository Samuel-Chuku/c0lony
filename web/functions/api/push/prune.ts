import { pushPrune } from "../../_lib/handlers.ts";
import { fallback, route } from "../../_lib/route.ts";

export const onRequestPost = route("POST", pushPrune);
export const onRequest = fallback;
