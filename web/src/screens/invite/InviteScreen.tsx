"use client";
import { Card, Hand } from "../../ui";
import { Screen } from "../../shell/Screen";
import { useSession } from "../../lib/session";

export function InviteScreen() {
  const session = useSession();
  const url = session.address ? `https://app.c0lony.xyz/colony?addr=${session.address}` : "https://app.c0lony.xyz";
  const text = "My ants are digging in on C0LONY. Come found a colony next to mine.";
  const href = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  return (
    <Screen back>
      <Card className="c0-inv">
        <h2 className="c0-pf__h2">Invite friends</h2>
        <p className="c0-pf__empty">More colonies nearby means more neighbours to raid and more WIF in the pot. Share your colony and let them find you.</p>
        <a className="c0-btn c0-btn--dark c0-btn--full c0-inv__btn" href={href} target="_blank" rel="noreferrer">Share on X</a>
        <Hand size={15} className="c0-inv__note">No rewards, just company.</Hand>
      </Card>
    </Screen>
  );
}
