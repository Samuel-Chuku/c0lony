"use client";
// The About page: a short field-journal note on what the game is, who made it and how to reach them.
import type { ReactNode } from "react";
import { BrandName, Card } from "../../ui";
import { Screen } from "../../shell/Screen";
import { NETWORK, NETWORK_NAME } from "../../config";
import "./about.css";

const P = ({ children }: { children: ReactNode }) => <p className="c0-ht__p">{children}</p>;
function Sec({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="c0-ht__card c0-ht__sec">
      <h2 className="c0-pf__h2">{title}</h2>
      {children}
    </Card>
  );
}

export function AboutScreen() {
  return (
    <Screen back title="About">
      <div className="c0-about__logo"><img src="/logo.svg" alt="C0LONY" width={244} height={92} /></div>
      <Sec title="What this is">
        <P><BrandName /> is a small ant colony you look after a little each day, the way you would check on a real ant farm. You dig, you send foragers out, you build a chamber or two. Then you close the app and the colony carries on without you.</P>
        <P>There is one rule that keeps the whole thing honest: the queen has to eat.</P>
      </Sec>
      <Sec title="Why WIF">
        <P>WIF is what feeds her. A full feeding keeps the queen going for 72 hours, and if she goes hungry for too long the colony collapses. That gives WIF a job inside the game, not just a price next to it.</P>
      </Sec>
      <Sec title="Why the raids are fair">
        <P>Colonies can raid each other, and nobody wants to lose soldiers to a rigged die. So every raid roll comes from drand, a public randomness beacon that anyone can check, and the result is verified onchain. Nobody picks the number, not the players and not me. Each raid report has a link so you can check it yourself.</P>
      </Sec>
      <Sec title="Who made it">
        <P>Built by Pixy, for the World is Flat hackathon.</P>
        <a className="c0-about__link" href="https://x.com/0xpixy" target="_blank" rel="noopener noreferrer">@0xpixy on X</a>
      </Sec>
      <Sec title="Early days">
        <P>This is early. The game runs on {NETWORK.name}{NETWORK_NAME === "testnet" ? " and is still on testnet" : ""}, so expect rough edges. Prices, timers and odds can change within limits set in the contract, and every change is public onchain.</P>
      </Sec>
      <Sec title="Say hello">
        <P>Found a bug, have an idea, or want to tell me how your colony is doing? Send a DM to @0xpixy on X. I read them.</P>
      </Sec>
      <p className="c0-about__soon">More about the team and the road ahead is coming soon.</p>
    </Screen>
  );
}
