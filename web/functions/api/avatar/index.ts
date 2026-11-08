import { avatarGet } from "../../_lib/identity.ts";
import { fallback, route } from "../../_lib/route.ts";

export const onRequestGet = route("GET", avatarGet);
export const onRequest = fallback;
