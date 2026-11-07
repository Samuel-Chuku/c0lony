// Telegram alerts (mainnet): link this wallet to the C0LONY bot and keep that chat's own alert switches.
import { NETWORK } from "../config";
import type { PushPrefs } from "./push";

export const TELEGRAM_ON: boolean = NETWORK.telegram;

async function post<T>(path: string, token: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw Object.assign(new Error(data.error || `The server answered ${res.status}.`), { status: res.status });
  return data;
}

export type TgStatus = { linked: boolean; prefs: PushPrefs };

export const tgStatus = (wallet: string, token: string) => post<TgStatus>("/api/telegram/status", token, { wallet: wallet.toLowerCase() });
export const tgLinkUrl = async (wallet: string, token: string, prefs: PushPrefs) =>
  (await post<{ url: string }>("/api/telegram/link", token, { wallet: wallet.toLowerCase(), prefs })).url;
export const tgSavePrefs = (wallet: string, token: string, prefs: PushPrefs) => post("/api/telegram/prefs", token, { wallet: wallet.toLowerCase(), prefs });
export const tgUnlink = (wallet: string, token: string) => post("/api/telegram/unlink", token, { wallet: wallet.toLowerCase() });
