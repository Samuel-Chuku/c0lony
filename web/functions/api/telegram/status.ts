import { tgStatus } from "../../_lib/telegram.ts";
import { fallback, route } from "../../_lib/route.ts";

export const onRequestPost = route("POST", tgStatus);
export const onRequest = fallback;
