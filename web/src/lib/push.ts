// Web Push in the browser: register the service worker, subscribe with the VAPID key, and hand the subscription
// to /api/push/subscribe. On iPhone this only works once the app is installed to the home screen (iOS 16.4+).
import { CONFIG } from "../config";

export type PushPrefs = Record<"raided" | "result" | "hungry12" | "hungry2" | "forage" | "avenge" | "season", boolean>;
export const DEFAULT_PREFS: PushPrefs = {
  raided: true,
  result: true,
  hungry12: true,
  hungry2: true,
  forage: true,
  avenge: true,
  season: true,
};

export type PushSupport = "ok" | "needs-install" | "unsupported" | "not-configured";

export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function pushSupport(): PushSupport {
  if (!CONFIG.vapidPublicKey) return "not-configured";
  if (isIos() && !isStandalone()) return "needs-install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  return "ok";
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register("/sw.js");
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function post(path: string, token: string, body: unknown): Promise<void> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `The server answered ${res.status}.`);
  }
}

/** Asks for permission, subscribes this device and stores it for `wallet`. Returns the endpoint. */
export async function enablePush(wallet: string, token: string, prefs: PushPrefs): Promise<string> {
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await registerServiceWorker());
  if (!reg) throw new Error("This browser can't receive alerts.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Alerts are blocked for this site in your browser settings.");
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(CONFIG.vapidPublicKey) }));
  const json = sub.toJSON();
  await post("/api/push/subscribe", token, { wallet: wallet.toLowerCase(), subscription: json, prefs });
  return sub.endpoint;
}

export async function savePushPrefs(wallet: string, token: string, endpoint: string, prefs: PushPrefs): Promise<void> {
  await post("/api/push/prefs", token, { wallet: wallet.toLowerCase(), endpoint, prefs });
}

export async function disablePush(token: string): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await post("/api/push/unsubscribe", token, { endpoint: sub.endpoint });
  await sub.unsubscribe();
}

export async function currentEndpoint(): Promise<string | null> {
  const reg = await navigator.serviceWorker?.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub?.endpoint ?? null;
}
