import { tgUnlink } from "../../_lib/telegram.ts";
import { fallback, route } from "../../_lib/route.ts";

export const onRequestPost = route("POST", tgUnlink);
export const onRequest = fallback;
