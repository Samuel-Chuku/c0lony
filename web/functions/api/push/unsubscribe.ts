import { pushUnsubscribe } from "../../_lib/handlers.ts";
import { fallback, route } from "../../_lib/route.ts";

export const onRequestPost = route("POST", pushUnsubscribe);
export const onRequest = fallback;
