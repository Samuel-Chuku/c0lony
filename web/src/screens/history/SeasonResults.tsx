"use client";
// A finished season, from public/season-data/<n>.json: the pot and who won it, claims, awards, every raid, the
// season in numbers, where the WIF went, the timeline and the contracts. ?colony=<id> opens one colony's season.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { Avatar, Button, Card, Fire, Hand, ResIcon, Underway, Wif } from "../../ui";
import { Screen } from "../../shell/Screen";
import { addressUrl, txUrl } from "../../lib/chain";
import { displayName } from "../../lib/format";
import { useSession } from "../../lib/session";
import { useXProfile } from "../../lib/useXProfile";
import { ClaimButton } from "../profile/ClaimButton";
import {
  awardsOf, biggestRaid, claimOf, fmtDay, fmtW, isHouse, useLiveClaims, useSeasonIndex, useSeasonResult,
  type PastColony, type SeasonResult,
} from "../../lib/seasons";
import "../season/season.css";
import "./history.css";

const REPO = "https://github.com/Samuel-Chuku/c0lony";
const short = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;
const Tx = ({ hash, children }: { hash: string; children?: ReactNode }) => (
  <a className="c0-hs__tx" href={txUrl(hash)} target="_blank" rel="noreferrer">{children ?? short(hash)} ›</a>
);

function Who({ c, size = 32 }: { c: PastColony; size?: 32 | 40 | 56 | 64 }) {
  const x = useXProfile(c.owner);
  const name = c.name ?? displayName(c.owner, x);
  return (
    <span className="c0-hs__who">
      <Avatar src={x?.xAvatar ?? null} address={c.owner} alt={name} size={size} />
      <span className="c0-hs__whoname">
        <b>{name}</b>
        <span>#{c.id}{isHouse(c.owner) ? " · house colony" : ""}</span>
      </span>
    </span>
  );
}

const name = (r: SeasonResult, id: number) => {
  const c = r.colonies.find((x) => x.id === id);
  return c?.name ?? (c ? `${c.owner.slice(0, 6)}…${c.owner.slice(-4)}` : `#${id}`);
};

export function SeasonResults({ n }: { n: number }) {
  const router = useRouter();
  const session = useSession();
  const pick = Number(useSearchParams().get("colony") ?? 0) || null;
  const q = useSeasonResult(n);
  const live = useLiveClaims(n);
  const r = q.data;
  if (!r) return <Screen back>{q.error ? <Card><p className="c0-pf__empty">Couldn&apos;t load Season {n}&apos;s results. {String(q.error.message ?? "")}</p></Card> : <Underway label={`Opening Season ${n}…`} />}</Screen>;

  const me = session.address ? r.colonies.find((c) => c.owner.toLowerCase() === session.address!.toLowerCase()) : undefined;
  const focus = (pick ? r.colonies.find((c) => c.id === pick) : undefined) ?? me;
  const champ = r.colonies.find((c) => c.rank === 1);
  const topPlayer = [...r.colonies].filter((c) => !isHouse(c.owner) && c.share > 0).sort((a, b) => b.share - a.share)[0];
  const awards = awardsOf(r);
  const big = biggestRaid(r);
  const t = r.totals;
  const open = (c: PastColony) => router.push(`/seasons?n=${n}&colony=${c.id}#colony`);

  return (
    <Screen back wide>
      <div className="c0-hs">
        <Card className="c0-hs__hero">
          <Hand size={18}>The results are in</Hand>
          <h1 className="c0-hs__title">SEASON {r.season}</h1>
          <p className="c0-hs__dates">{fmtDay(r.start)} to {fmtDay(r.end)}</p>
          <div className="c0-hs__pot"><Wif size={30}>{fmtW(r.pot.total, 0)}</Wif></div>
          <p className="c0-hs__sub">
            in the pot, shared by {r.pot.qualified} colon{r.pot.qualified === 1 ? "y" : "ies"} · {t.colonies} founded · {fmtW(t.transactions, 0)} transactions onchain
          </p>
          <p className="c0-hs__proof">Closed onchain <Tx hash={r.endTx} /> · ranking verified by the contract <Tx hash={r.finalizeTx} /></p>
        </Card>

        {champ ? <Champion r={r} c={champ} live={live} onOpen={() => open(champ)} /> : null}
        {champ && isHouse(champ.owner) && topPlayer ? <Champion r={r} c={topPlayer} live={live} onOpen={() => open(topPlayer)} label="Top player from the pot" /> : null}

        <section className="c0-hs__sec">
          <h2 className="c0-ss__h">PAYOUTS</h2>
          <Card>
            <p className="c0-hs__note">
              Half the pot ({fmtW(r.pot.half, 0)} WIF) was shared by score among every colony alive at the end and fed at least twice. The other half went to the top quarter ({r.pot.topCount} colon{r.pot.topCount === 1 ? "y" : "ies"}), by score.
            </p>
            <ol className="c0-hs__pay">
              {r.colonies.map((c) => {
                const cl = claimOf(c, live);
                return (
                  <li key={c.id} className="c0-hs__payrow">
                    <span className="c0-hs__rank">{c.rank ?? "–"}</span>
                    <button type="button" className="c0-linkbtn c0-hs__paywho" onClick={() => open(c)}><Who c={c} /></button>
                    <span className="c0-hs__payscore"><b>{fmtW(c.score, 0)}</b><span>score</span></span>
                    <span className="c0-hs__payamt">
                      {c.share > 0 ? <Wif>{fmtW(c.share)}</Wif> : <span className="c0-hs__muted">{c.fedTwice ? "not alive at the end" : `fed ${c.feeds} of 2 times`}</span>}
                      {c.share > 0 ? (cl.tx ? <Tx hash={cl.tx}>claimed</Tx> : <span className="c0-hs__muted">yet to claim</span>) : null}
                    </span>
                  </li>
                );
              })}
            </ol>
          </Card>
        </section>

        <section className="c0-hs__sec" id="colony">
          <h2 className="c0-ss__h">{focus && focus === me && !pick ? `YOUR SEASON ${n}` : focus ? `${(focus.name ?? `COLONY #${focus.id}`).toUpperCase()}'S SEASON` : `YOUR SEASON ${n}`}</h2>
          {focus ? <ColonySeason r={r} c={focus} live={live} mine={focus === me} /> : (
            <Card><p className="c0-pf__empty">{session.address ? `This wallet had no colony in Season ${n}. Tap any colony above to see its season.` : "Sign in to see your season, or tap any colony above."}</p></Card>
          )}
          {focus === me && session.address ? <ClaimButton wallet={session.address} season={n + 1} /> : null}
        </section>

        <section className="c0-hs__sec">
          <h2 className="c0-ss__h">AWARDS</h2>
          <p className="c0-hs__muted">For the players. genesis, the house colony, is left out.</p>
          <div className="c0-hs__awards">
            {awards.map((a) => (
              <button type="button" key={a.key} className="c0-hs__award" onClick={() => open(a.colony)}>
                <Hand size={16}>{a.title}</Hand>
                <Who c={a.colony} size={32} />
                <b className="c0-hs__awardval">{a.value}</b>
                <span className="c0-hs__muted">{a.note}</span>
              </button>
            ))}
            {big ? (
              <a className="c0-hs__award" href={`/report?raid=${big.id}`}>
                <Hand size={16}>Biggest single raid</Hand>
                <b className="c0-hs__awardval">{fmtW(big.loot, 0)} {big.lootResource}</b>
                <span className="c0-hs__muted">{name(r, big.raider)} on {name(r, big.defender)} · roll {big.roll} · {fmtDay(big.settledAt)}</span>
              </a>
            ) : null}
          </div>
        </section>

        <section className="c0-hs__sec">
          <h2 className="c0-ss__h">THE SEASON IN NUMBERS</h2>
          <div className="c0-hs__grid">
            <Num v={fmtW(t.transactions, 0)} c="game transactions" />
            <Num v={t.colonies} c="colonies founded" />
            <Num v={t.qualified} c="shared the pot" />
            <Num v={t.feedings} c="queen feedings" />
            <Num v={fmtW(t.tends, 0)} c="tends" res="ant" />
            <Num v={t.builds} c="buildings" />
            <Num v={fmtW(t.antsBorn, 0)} c="ants born" res="ant" />
            <Num v={fmtW(t.leaves, 0)} c="leaves gathered" res="leaf" />
            <Num v={fmtW(t.sugar, 0)} c="sugar gathered" res="sugar" />
            <Num v={t.raids} c="raids" />
            <Num v={t.raidsWon} c="raids won" />
            <Num v={t.raidsGuarded} c="raids guarded" />
            <Num v={fmtW(t.loot, 0)} c="loot carried off" />
            <Num v={t.avenges} c="avenge raids" />
            <Num v={t.drandRounds} c="drand rounds verified onchain" />
            <Num v={t.shields + t.speedups} c="shields and speed-ups" />
          </div>
        </section>

        <section className="c0-hs__sec">
          <h2 className="c0-ss__h">WHERE THE WIF WENT</h2>
          <Card>
            <div className="c0-hs__flow">
              <div><span className="c0-hs__muted">Players spent</span><Wif size={22}>{fmtW(r.spend.total, 0)}</Wif></div>
              <div><span className="c0-hs__muted">70% to the pot</span><Wif size={22}>{fmtW(r.spend.toPot, 0)}</Wif></div>
              <div><span className="c0-hs__muted">20% burned</span><span className="c0-ss__burnbox"><Fire size={22} /><Wif size={20}>{fmtW(r.spend.burned, 0)}</Wif></span></div>
              <div><span className="c0-hs__muted">10% to the treasury</span><Wif size={22}>{fmtW(r.spend.toTreasury, 0)}</Wif></div>
            </div>
            <ul className="c0-hs__list">
              {Object.entries(r.byAction).map(([k, v]) => (
                <li key={k}><span>{ACTION[k] ?? k} · {v.count}×</span><Wif>{fmtW(v.wif, 0)}</Wif></li>
              ))}
              {r.pot.sponsors.map((s) => (
                <li key={s.tx}><span>Pot seed · {s.name}</span><span><Wif>{fmtW(s.amount, 0)}</Wif> <Tx hash={s.tx} /></span></li>
              ))}
            </ul>
            <p className="c0-hs__note">
              The pot: {fmtW(r.pot.seed, 0)} WIF seed + {fmtW(r.pot.fromPlay, 0)} WIF from play = {fmtW(r.pot.total, 0)} WIF.
              {t.settleRefunds ? ` The treasury paid the gas for all ${t.settleRefunds} raid settlements and ${t.drips} starter gas drips.` : ""}
            </p>
          </Card>
        </section>

        <section className="c0-hs__sec">
          <h2 className="c0-ss__h">EVERY RAID</h2>
          <Card>
            <ol className="c0-hs__raids">
              {[...r.raids].reverse().map((x) => (
                <li key={x.id} className="c0-hs__raid">
                  <span className={x.outcome === 1 ? "c0-hs__out c0-hs__out--won" : "c0-hs__out"}>{x.outcome === 1 ? "WON" : x.outcome === 3 ? "GUARDED" : "LOST"}</span>
                  <span className="c0-hs__raidtext">
                    <span><b>{name(r, x.raider)}</b> raided <b>{name(r, x.defender)}</b>{x.isAvenge ? " · avenge" : ""}</span>
                    <span className="c0-hs__muted">
                      {x.outcome === 1 ? `took ${fmtW(x.loot, 1)} ${x.lootResource}` : x.outcome === 3 ? `guarded · ${x.soldiersLost} soldiers lost` : "came back empty"} · roll {x.roll} · drand round {x.round} · {fmtDay(x.settledAt)}
                    </span>
                  </span>
                  <a className="c0-hs__tx" href={`/report?raid=${x.id}`}>report ›</a>
                </li>
              ))}
            </ol>
          </Card>
        </section>

        <section className="c0-hs__sec">
          <h2 className="c0-ss__h">TIMELINE</h2>
          <Card>
            <ol className="c0-hs__time">
              {r.timeline.map((e, i) => (
                <li key={i}><span className="c0-hs__muted">{fmtDay(e.at)}</span><span>{e.kind === "end" && e.at - r.start < 3600 ? "Season end set at launch" : e.text}</span><Tx hash={e.tx} /></li>
              ))}
              {r.givenBack.map((g) => (
                <li key={g.tx}><span className="c0-hs__muted">{fmtDay(g.at)}</span><span>{fmtW(g.amount, 0)} WIF of winnings sponsored into Season {g.toSeason}</span><Tx hash={g.tx} /></li>
              ))}
            </ol>
          </Card>
        </section>

        <section className="c0-hs__sec">
          <h2 className="c0-ss__h">READ THE CODE</h2>
          <Card>
            <p className="c0-hs__note">Every number on this page comes from these contracts. They are verified, so anyone can read the source on the explorer.</p>
            <ul className="c0-hs__list">
              <li><span>ColonyGame · the game</span><a className="c0-hs__tx" href={`${addressUrl(r.contracts.colonyGame)}?tab=contract`} target="_blank" rel="noreferrer">{short(r.contracts.colonyGame)} ›</a></li>
              <li><span>SeasonPot · holds and pays the pot</span><a className="c0-hs__tx" href={`${addressUrl(r.contracts.seasonPot)}?tab=contract`} target="_blank" rel="noreferrer">{short(r.contracts.seasonPot)} ›</a></li>
              <li><span>Treasury · gas refunds and drips</span><a className="c0-hs__tx" href={`${addressUrl(r.contracts.treasury)}?tab=contract`} target="_blank" rel="noreferrer">{short(r.contracts.treasury)} ›</a></li>
              <li><span>DrandVerifier · checks every raid roll</span><a className="c0-hs__tx" href={`${addressUrl(r.contracts.drandVerifier)}?tab=contract`} target="_blank" rel="noreferrer">{short(r.contracts.drandVerifier)} ›</a></li>
              <li><span>Source code on GitHub</span><a className="c0-hs__tx" href={REPO} target="_blank" rel="noreferrer">c0lony ›</a></li>
            </ul>
          </Card>
        </section>

        <PastSeasons current={n} />
      </div>
    </Screen>
  );
}

const ACTION: Record<string, string> = { found: "Foundings", feed: "Feedings", shield: "Shields", speedUp: "Speed-ups", revive: "Revives" };

function Num({ v, c, res }: { v: ReactNode; c: string; res?: "ant" | "leaf" | "sugar" }) {
  return (
    <div className="c0-hs__num">
      {res ? <ResIcon name={res} size={20} /> : null}
      <b>{v}</b>
      <span>{c}</span>
    </div>
  );
}

function Champion({ r, c, live, onOpen, label = "Top earner from the pot" }: { r: SeasonResult; c: PastColony; live: ReturnType<typeof useLiveClaims>; onOpen: () => void; label?: string }) {
  const cl = claimOf(c, live);
  const back = r.givenBack.find((g) => g.by.toLowerCase() === c.owner.toLowerCase());
  return (
    <Card className="c0-hs__champ">
      <Hand size={18}>{label}</Hand>
      <Who c={c} size={56} />
      <div className="c0-hs__champamt"><Wif size={30}>{fmtW(c.share)}</Wif></div>
      <p className="c0-hs__sub">
        {fmtW((c.share / r.pot.total) * 100, 1)}% of the pot · score {fmtW(c.score, 0)}{c.top ? " · top quarter" : ""}
      </p>
      <p className="c0-hs__proof">{c.share <= 0 ? null : cl.tx ? <>Claimed {cl.at ? fmtDay(cl.at) : ""} <Tx hash={cl.tx} /></> : "Yet to claim"}</p>
      {back ? (
        <p className="c0-hs__note">
          {c.name ?? `#${c.id}`} is C0LONY&apos;s own house colony. Its {fmtW(back.amount, 0)} WIF went straight back into the Season {back.toSeason} pot for the players. <Tx hash={back.tx} />
        </p>
      ) : null}
      <div className="c0-hs__btns">
        <Button variant="paper" onClick={onOpen}>See their season ›</Button>
        <Link className="c0-hs__tx" href={`/colony?addr=${c.owner}`}>Profile ›</Link>
      </div>
    </Card>
  );
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return <div className="c0-ss__row"><span>{k}</span><b>{v}</b></div>;
}

function ColonySeason({ r, c, live, mine }: { r: SeasonResult; c: PastColony; live: ReturnType<typeof useLiveClaims>; mine: boolean }) {
  const cl = claimOf(c, live);
  const raids = r.raids.filter((x) => x.raider === c.id || x.defender === c.id);
  return (
    <Card className={mine ? "c0-card--clay" : undefined}>
      <div className="c0-hs__colhead"><Who c={c} size={40} /><Link className="c0-hs__tx" href={`/colony?addr=${c.owner}`}>Profile ›</Link></div>
      <div className="c0-ss__rows">
        <Row k="Final rank" v={c.rank ? `#${c.rank} of ${r.pot.qualified}` : "Not ranked"} />
        <Row k="Score" v={fmtW(c.score, 0)} />
        <Row k="Pot share" v={c.share > 0 ? <span className="c0-ss__chip"><Wif>{fmtW(c.share)}</Wif></span> : "None"} />
        {c.share > 0 ? <Row k="Claimed" v={cl.tx ? <Tx hash={cl.tx}>yes</Tx> : "Yet to claim"} /> : null}
        <Row k="Founded" v={<>{fmtDay(c.foundedAt)} <Tx hash={c.foundTx} /></>} />
        <Row k="Queen fed" v={`${c.feeds} times`} />
        <Row k="Alive at the end" v={c.alive ? "Yes" : "No"} />
        <Row k="Ants" v={`${fmtW(c.workers, 0)} · ${fmtW(c.born, 0)} born`} />
        <Row k="Tends" v={fmtW(c.tends, 0)} />
        <Row k="Gathered" v={`${fmtW(c.leaves, 0)} leaves · ${fmtW(c.sugar, 0)} sugar`} />
        <Row k="Buildings" v={`${c.builds} · ${c.chambers} chambers, ${c.farms} farms, ${c.trails} trails`} />
        <Row k="Raids launched" v={`${c.raids} · ${c.raidsWon} won, ${c.raidsGuarded} guarded`} />
        <Row k="Loot carried home" v={fmtW(c.loot, 1)} />
        <Row k="Raided" v={`${c.raided} times · ${c.guards} guarded · lost ${fmtW(c.lootLost, 1)}`} />
        <Row k="Shields · speed-ups" v={`${c.shields} · ${c.speedups}`} />
        <Row k="WIF spent" v={<Wif>{fmtW(c.wifSpent, 0)}</Wif>} />
        <Row k="WIF burned by this colony" v={<Wif>{fmtW(c.wifBurned, 0)}</Wif>} />
      </div>
      {raids.length ? (
        <>
          <h3 className="c0-hs__h3">Raids</h3>
          <ol className="c0-hs__raids">
            {[...raids].reverse().map((x) => {
              const att = x.raider === c.id;
              return (
                <li key={x.id} className="c0-hs__raid">
                  <span className={x.outcome === 1 ? "c0-hs__out c0-hs__out--won" : "c0-hs__out"}>{att ? (x.outcome === 1 ? "WON" : x.outcome === 3 ? "BLOCKED" : "LOST") : x.outcome === 1 ? "RAIDED" : x.outcome === 3 ? "GUARDED" : "HELD"}</span>
                  <span className="c0-hs__raidtext">
                    <span>{att ? <>on <b>{name(r, x.defender)}</b></> : <>by <b>{name(r, x.raider)}</b></>}</span>
                    <span className="c0-hs__muted">{x.outcome === 1 ? `${fmtW(x.loot, 1)} ${x.lootResource}` : "nothing taken"} · {fmtDay(x.settledAt)}</span>
                  </span>
                  <a className="c0-hs__tx" href={`/report?raid=${x.id}`}>report ›</a>
                </li>
              );
            })}
          </ol>
        </>
      ) : null}
    </Card>
  );
}

export function PastSeasons({ current }: { current?: number }) {
  const idx = useSeasonIndex().data;
  const others = (idx?.seasons ?? []).filter((s) => s.season !== current);
  if (current !== undefined && !others.length) return null;
  return (
    <section className="c0-hs__sec">
      <h2 className="c0-ss__h">{current !== undefined ? "OTHER SEASONS" : "PAST SEASONS"}</h2>
      {!idx ? <Underway label="Opening the history…" /> : (idx.seasons.length === 0 ? <Card><p className="c0-pf__empty">No season has finished yet.</p></Card> : (
        <div className="c0-ss__links">
          {(current !== undefined ? others : idx.seasons).map((s) => (
            <Link key={s.season} className="c0-ss__link c0-hs__seasonlink" href={`/seasons?n=${s.season}`}>
              <span>Season {s.season} <span className="c0-hs__muted">· {fmtDay(s.end).replace(/ \d\d:\d\d UTC$/, "")} · {s.colonies} colonies</span></span>
              <span><Wif>{fmtW(s.pot, 0)}</Wif> ›</span>
            </Link>
          ))}
        </div>
      ))}
    </section>
  );
}

/** /seasons: the history list, or one season with ?n=. */
export function SeasonsRoute() {
  const n = Number(useSearchParams().get("n") ?? 0) || null;
  if (n) return <SeasonResults n={n} />;
  return (
    <Screen back>
      <h2 className="c0-lb__title">SEASON HISTORY</h2>
      <PastSeasons />
    </Screen>
  );
}

/** On the Season tab: the last finished season's winner and a way into its results. */
export function LastSeasonCard() {
  const router = useRouter();
  const latest = useSeasonIndex().data?.seasons[0] ?? null;
  const r = useSeasonResult(latest?.season ?? null).data;
  if (!latest || !r) return null;
  const champ = r.colonies.find((c) => c.rank === 1);
  return (
    <>
      <h2 className="c0-ss__h">LAST SEASON</h2>
      <Card className="c0-hs__champ">
        <Hand size={16}>Season {r.season} · {fmtW(r.pot.total, 0)} WIF paid out to {r.pot.qualified} colonies</Hand>
        {champ ? <Who c={champ} size={40} /> : null}
        {champ ? <p className="c0-hs__sub">Top earner · <Wif>{fmtW(champ.share)}</Wif></p> : null}
        <p className="c0-hs__note">{r.totals.colonies} colonies · {r.totals.raids} raids · {r.totals.feedings} feedings · {fmtW(r.spend.burned, 0)} WIF burned</p>
        <Button variant="dark" onClick={() => router.push(`/seasons?n=${r.season}`)}>Season {r.season} results ›</Button>
      </Card>
    </>
  );
}
