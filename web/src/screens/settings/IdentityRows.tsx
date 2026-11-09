"use client";
// Your name and picture, for players who did not link X (X players show their X handle and picture instead).
// The name is set onchain (it also names the colony NFT) and can change once per 21 days. The picture is shrunk
// to 128 px here and stored by the app.
import { useEffect, useRef, useState } from "react";
import { keccak256, toBytes, type Address } from "viem";
import { Avatar, Button } from "../../ui";
import { NETWORK } from "../../config";
import { colonyGameAbi } from "../../lib/abi";
import { publicClient } from "../../lib/chain";
import { reloadProfile } from "../../lib/api";
import { useProfile } from "../../lib/game";
import { useSession } from "../../lib/session";
import { useAction } from "../../lib/tx";
import { useXProfile } from "../../lib/useXProfile";

const GAME = NETWORK.contracts.colonyGame as Address;
const COOLDOWN = 21 * 86400;
const NAME_RE = /^[a-z0-9_]{3,16}$/;
const DAY = 86400;

/** Center-crops and shrinks a picture to 128x128. WebP where the browser can make it, else PNG. */
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => bad(new Error("That file isn't a picture we can read."));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    c.getContext("2d")!.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 128, 128);
    const webp = c.toDataURL("image/webp", 0.85);
    return webp.startsWith("data:image/webp") ? webp : c.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function IdentityRows() {
  const session = useSession();
  const addr = session.address;
  const x = useXProfile(addr);
  const hasX = !!x?.xHandle;
  return (
    <>
      {hasX ? (
        <p className="c0-set__note">Your X handle and picture show in the game. A colony name below still names your colony NFT.</p>
      ) : null}
      {NETWORK.names ? <NameRow /> : null}
      {!hasX ? <PictureRow /> : null}
    </>
  );
}

function NameRow() {
  const session = useSession();
  const addr = session.address as Address | null;
  const profile = useProfile(session.address);
  const [current, setCurrent] = useState<{ name: string; setAt: number } | null>(null);
  const [draft, setDraft] = useState("");
  const [taken, setTaken] = useState(false);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const save = useAction("Naming", { success: () => ({ title: "Name saved", lines: ["It shows in place of your address within a minute.", "You can change it again in 21 days."] }) });

  const load = async () => {
    if (!addr) return;
    try {
      const [name, setAt] = await Promise.all([
        publicClient.readContract({ address: GAME, abi: colonyGameAbi, functionName: "nameOf", args: [addr] }),
        publicClient.readContract({ address: GAME, abi: colonyGameAbi, functionName: "nameSetAt", args: [addr] }),
      ]);
      setCurrent({ name: name as string, setAt: Number(setAt) });
      setNow(Math.floor(Date.now() / 1000));
    } catch { /* leave as loading */ }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [addr]);

  // Is the typed name already someone's? Checked onchain, a moment after typing stops.
  useEffect(() => {
    setTaken(false);
    if (!NAME_RE.test(draft)) return;
    const t = setTimeout(async () => {
      try {
        const holder = await publicClient.readContract({ address: GAME, abi: colonyGameAbi, functionName: "nameHolder", args: [keccak256(toBytes(draft))] });
        setTaken(/^0x0{40}$/i.test(holder as string) ? false : (holder as string).toLowerCase() !== addr?.toLowerCase());
      } catch { /* the save will tell */ }
    }, 400);
    return () => clearTimeout(t);
  }, [draft, addr]);

  const waitLeft = current && current.setAt > 0 ? current.setAt + COOLDOWN - now : 0;
  const hasColony = !!profile.data && profile.data.colonyId > 0n;
  // Hard blocks get a full-width strip under the field so they can't be missed; typing hints stay small.
  const block = !addr ? "Sign in first to name your colony."
    : !hasColony ? "Found a colony first. Names belong to a living colony this season."
    : waitLeft > 0 ? `You can change your name again in ${Math.ceil(waitLeft / DAY)} days.`
    : undefined;
  const reason = block ? "Not yet"
    : !NAME_RE.test(draft) ? "3 to 16 characters: a to z, 0 to 9 and _"
    : taken ? "That name is taken"
    : draft === current?.name ? "That's already your name"
    : undefined;

  return (
    <div className="c0-srow c0-srow--stack">
      <div className="c0-srow__text">
        <span>Colony name</span>
        <span className="c0-srow__hint">
          {current?.name ? `${current.name} · ` : ""}shows instead of your address when you haven&apos;t linked X, and names your colony NFT. Once set, it can change again after 21 days.
        </span>
      </div>
      <div className="c0-namefield">
        <input
          className="c0-input"
          aria-label="Colony name"
          placeholder={current?.name || "your_colony"}
          value={draft}
          maxLength={16}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
        />
        <Button
          variant="paper"
          size="compact"
          busy={save.busy ? "Saving…" : undefined}
          disabledReason={reason}
          onClick={async () => {
            const h = await save.run({ functionName: "setName", args: [draft] });
            if (h) {
              setDraft("");
              await load();
              setTimeout(() => addr && reloadProfile(addr), 30_000); // the keeper picks it up within ~15 s
            }
          }}
        >
          Save name
        </Button>
      </div>
      {block ? <div className="c0-blocked" role="status">{block}</div> : null}
    </div>
  );
}

function PictureRow() {
  const session = useSession();
  const addr = session.address;
  const x = useXProfile(addr);
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(image: string | null) {
    if (!addr) return;
    setError(null);
    setBusy(image ? "Uploading…" : "Removing…");
    try {
      const token = await session.getToken();
      if (!token) throw new Error("Sign in again, then try once more.");
      const res = await fetch("/api/avatar/upload", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ wallet: addr.toLowerCase(), image }),
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "The picture didn't save.");
      reloadProfile(addr);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The picture didn't save.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="c0-srow">
        <Avatar size={40} src={x?.xAvatar ?? null} address={addr ?? undefined} alt="Your picture" />
        <div className="c0-srow__text">
          <span>Picture</span>
          <span className="c0-srow__hint">{!addr ? "Sign in to add a picture" : "shows next to your name for everyone"}</span>
        </div>
        {addr ? (
          <div className="c0-srow__btns">
            {x?.xAvatar ? <Button variant="paper" size="compact" busy={busy === "Removing…" ? busy : undefined} onClick={() => void send(null)}>Remove</Button> : null}
            <Button variant="paper" size="compact" busy={busy === "Uploading…" ? busy : undefined} onClick={() => file.current?.click()}>
              {x?.xAvatar ? "Change" : "Upload"}
            </Button>
          </div>
        ) : null}
        <input
          ref={file}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            try {
              await send(await shrink(f));
            } catch (err) {
              setError(err instanceof Error ? err.message : "That picture couldn't be used.");
            }
          }}
        />
      </div>
      {error ? <div className="c0-blocked" role="alert">{error}</div> : null}
    </>
  );
}
