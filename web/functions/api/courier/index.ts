import { courierSubmit } from "../../_lib/courier.ts";
import { fallback, route } from "../../_lib/route.ts";

export const onRequestPost = route("POST", courierSubmit);
export const onRequest = fallback;
