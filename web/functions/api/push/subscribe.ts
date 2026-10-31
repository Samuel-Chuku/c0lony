import { pushSubscribe } from "../../_lib/handlers.ts";
import { fallback, route } from "../../_lib/route.ts";

export const onRequestPost = route("POST", pushSubscribe);
export const onRequest = fallback;
