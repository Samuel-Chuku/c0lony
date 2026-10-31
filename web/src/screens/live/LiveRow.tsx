"use client";
import { useRouter } from "next/navigation";
import { FeedRow } from "../../ui";
import type { FeedEvent } from "../../lib/api";
import { timeAgo } from "../../lib/format";
import { useXProfile } from "../../lib/useXProfile";
import { describeEvent, feedIntentUrl } from "./feedText";

export function LiveRow({ ev, me, now }: { ev: FeedEvent; me: string | null; now: number }) {
  const router = useRouter();
  const line = describeEvent(ev, me);
  const actor = line?.actor ?? ev.actors[0];
  const x = useXProfile(actor);
  if (!line) return null;
  const own = !!me && ev.actors.some((a) => a.toLowerCase() === me);
  return (
    <FeedRow
      avatar={{ src: x?.xAvatar ?? null, address: actor, alt: x?.xHandle ? `@${x.xHandle}` : "Player" }}
      kind={line.kind}
      kindTone={line.tone}
      timeAgo={timeAgo(ev.ts, now).replace(" ago", "")}
      own={own}
      shareHref={own && line.shareText && me ? feedIntentUrl(line.shareText, me) : undefined}
      onOpenProfile={() => actor && router.push(`/colony?addr=${actor}`)}
    >
      {line.sentence}
    </FeedRow>
  );
}
