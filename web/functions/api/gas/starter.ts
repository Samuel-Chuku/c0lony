import { gasStarter } from "../../_lib/handlers.ts";
import { fallback, route } from "../../_lib/route.ts";

export const onRequestPost = route("POST", gasStarter);
export const onRequest = fallback;
