import { pushTargets } from "../../_lib/handlers.ts";
import { fallback, route } from "../../_lib/route.ts";

export const onRequestPost = route("POST", pushTargets);
export const onRequest = fallback;
