import { courierPending } from "../../_lib/courier.ts";
import { fallback, route } from "../../_lib/route.ts";

export const onRequestPost = route("POST", courierPending);
export const onRequest = fallback;
