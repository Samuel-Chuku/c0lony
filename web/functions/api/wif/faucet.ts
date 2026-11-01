import { wifFaucet } from "../../_lib/handlers.ts";
import { fallback, route } from "../../_lib/route.ts";

export const onRequestPost = route("POST", wifFaucet);
export const onRequest = fallback;
