// Telegram alerts: the same alerts as push, sent as a picture card with a button that opens the right screen.
// Which chats to send to (and each chat's switches) come from the app, signed like the push targets.
import { signedPost, type FetchFn } from "../feed/signed.ts";
import type { PushPayload } from "./scheduler.ts";

export type TgTarget = { wallet: string; chatId: string; prefs: Record<string, boolean> };

/** Button text per alert kind. */
const ACTION: Record<string, string> = {
  raided: "Guard now",
  result: "See the report",
  hungry12: "Feed her",
  hungry2: "Feed her",
  forage: "Tend",
  avenge: "Avenge",
  season: "See the pot",
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export class TelegramClient {
  private readonly o: { apiBase: string; secret: string; token: string; fetchFn: FetchFn; log: (m: string) => void };

  constructor(opts: { apiBase: string; secret: string; token: string; fetchFn?: FetchFn; log?: (m: string) => void }) {
    this.o = { fetchFn: fetch, log: () => {}, ...opts };
  }

  async targets(wallets: string[]): Promise<TgTarget[]> {
    const res = await signedPost(this.o.fetchFn, `${this.o.apiBase}/api/telegram/targets`, this.o.secret, { wallets });
    if (!res.ok) throw new Error(`telegram/targets HTTP ${res.status}`);
    return ((await res.json()) as { targets: TgTarget[] }).targets;
  }

  private async prune(chatIds: string[]): Promise<void> {
    if (chatIds.length === 0) return;
    const res = await signedPost(this.o.fetchFn, `${this.o.apiBase}/api/telegram/prune`, this.o.secret, { chatIds });
    if (!res.ok) this.o.log(`telegram: prune failed HTTP ${res.status}`);
  }

  /** The Bot API message for one alert: a picture card, the alert text, and a button to the screen it is about. */
  message(chatId: string, pref: string, payload: PushPayload) {
    const image = payload.image ?? pref;
    return {
      chat_id: chatId,
      photo: `${this.o.apiBase}/tg/${image}.png`,
      caption: `<b>C0LONY</b>\n${esc(payload.body)}`,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: ACTION[pref] ?? "Open C0LONY", url: `${this.o.apiBase}${payload.url}` }]] },
    };
  }

  /** Sends to the wallet's linked chat when that chat has `pref` on. Returns how many were delivered. */
  async notify(wallet: string, pref: string, payload: PushPayload): Promise<number> {
    const w = wallet.toLowerCase();
    const targets = (await this.targets([w])).filter((t) => t.wallet.toLowerCase() === w && t.prefs?.[pref] !== false);
    const gone: string[] = [];
    let delivered = 0;
    for (const t of targets) {
      try {
        const res = await this.o.fetchFn(`https://api.telegram.org/bot${this.o.token}/sendPhoto`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(this.message(t.chatId, pref, payload)),
        });
        if (res.ok) {
          delivered++;
          continue;
        }
        const err = ((await res.json().catch(() => ({}))) as { description?: string }).description ?? "";
        // 403: the player blocked the bot. 400 "chat not found": the chat is gone. Neither can ever work again.
        if (res.status === 403 || (res.status === 400 && /chat not found|user is deactivated/i.test(err))) gone.push(t.chatId);
        else this.o.log(`telegram: send failed HTTP ${res.status} ${err}`);
      } catch (e) {
        this.o.log(`telegram: send failed (${e instanceof Error ? e.message : e})`);
      }
    }
    await this.prune(gone);
    return delivered;
  }
}
