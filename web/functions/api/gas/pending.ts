import { gasPending } from "../../_lib/handlers.ts";
import { fallback, route } from "../../_lib/route.ts";

export const onRequestPost = route("POST", gasPending);
export const onRequest = fallback;
