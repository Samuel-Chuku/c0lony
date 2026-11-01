import { gasDone } from "../../_lib/handlers.ts";
import { fallback, route } from "../../_lib/route.ts";

export const onRequestPost = route("POST", gasDone);
export const onRequest = fallback;
