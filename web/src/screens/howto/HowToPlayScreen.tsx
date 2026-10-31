"use client";
import { Card } from "../../ui";
import { Screen } from "../../shell/Screen";
import { fmtWif } from "../../lib/format";
import { useGameConfig } from "../../lib/game";

export function HowToPlayScreen() {
  const cfg = useGameConfig().data;
  const found = cfg ? ` for ${fmtWif(cfg.foundPrice)} WIF` : "";
  const feed = cfg ? ` for ${fmtWif(cfg.feedPrice)} WIF` : "";
  const steps: { title: string; text: string }[] = [
    { title: "Found your colony", text: `Start a colony${found}. You get a queen, a few ants and a place to dig.` },
    { title: "Feed the queen every 3 days", text: `Feeding${feed} keeps her alive and scores points. Miss it and the colony falls.` },
    { title: "Build and assign ants", text: "Dig chambers, build trails and farms, then put ants to work. Free ants can raid and guard." },
    { title: "Raid and guard", text: "Send soldiers at a neighbour. They can guard one store, and a drand roll decides who wins." },
    { title: "Finish in the top quarter to share the pot", text: "Every colony still alive at the end and fed at least twice shares half the pot by score. The top quarter also splits the other half. Claim your share when the season ends." },
  ];
  return (
    <Screen back>
      <div className="c0-ht__logo"><img src="/logo.svg" alt="C0LONY" width={244} height={92} /></div>
      <Card className="c0-ht__card">
        <h2 className="c0-pf__h2">How to play</h2>
        <ol className="c0-ht__steps">
          {steps.map((s, i) => (
            <li key={s.title} className="c0-ht__step">
              <span className="c0-ht__num" aria-hidden="true">{i + 1}</span>
              <div>
                <div className="c0-ht__stitle">{s.title}</div>
                <div className="c0-ht__stext">{s.text}</div>
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </Screen>
  );
}
