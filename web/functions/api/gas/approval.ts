import { gasApproval } from "../../_lib/handlers.ts";
import { fallback, route } from "../../_lib/route.ts";

export const onRequestPost = route("POST", gasApproval);
export const onRequest = fallback;
