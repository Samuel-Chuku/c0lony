import { avatarUpload } from "../../_lib/identity.ts";
import { fallback, route } from "../../_lib/route.ts";

export const onRequestPost = route("POST", avatarUpload);
export const onRequest = fallback;
