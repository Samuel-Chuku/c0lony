import { courierConfig } from "../../_lib/courier.ts";
import { fallback, route } from "../../_lib/route.ts";

export const onRequestGet = route("GET", courierConfig);
export const onRequest = fallback;
