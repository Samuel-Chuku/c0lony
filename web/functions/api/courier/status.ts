import { courierStatus } from "../../_lib/courier.ts";
import { fallback, route } from "../../_lib/route.ts";

export const onRequestGet = route("GET", courierStatus);
export const onRequest = fallback;
