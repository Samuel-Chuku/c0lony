"use client";
import "./landing.css";
import { Tracker } from "../screens/raids/Tracker";
import type { ReactNode } from "react";
import { APP_URL, BRAND } from "../brand";
import { NETWORK, NETWORK_NAME, CONFIG } from "../config";
import { BrandName, Hand, Meter, PixelIcon, ResIcon, shortAddress, withBrand } from "../ui";
import { HeroWorld } from "./HeroWorld";
import { Guide, useGuide } from "../guide/Guide";
import { LiveNumbers } from "./LiveNumbers";

const REPO_URL = "https://github.com/Samuel-Chuku/c0lony";
const SECURITY_DOC = `${REPO_URL}/blob/main/docs/SECURITY_REVIEW.md`;
const DRAND_INFO = `${CONFIG.drand.apiUrl}/${CONFIG.drand.chainHash}/info`;

const Wif = ({ children }: { children: ReactNode }) => <span className="l-wif"><ResIcon name="wif" size={20} />{children}</span>;

function PlayButton({ hero = false, label = <>Play <BrandName /></> }: { hero?: boolean; label?: ReactNode }) {
  return (
    <a className={`c0-btn c0-btn--paper l-play${hero ? " c0-btn--hero" : ""}`} href={APP_URL}>
      {label}
    </a>
  );
}

const CONTRACTS = [
  ["ColonyGame", NETWORK.contracts.colonyGame],
  ["SeasonPot", NETWORK.contracts.seasonPot],
  ["Treasury", NETWORK.contracts.treasury],
  [NETWORK_NAME === "testnet" ? "MockWIF (test token)" : "WIF", NETWORK.contracts.wif],
].filter(([, a]) => a) as [string, string][];

const STEPS: { icon: ReactNode; title: string; body: string }[] = [
  {
    icon: <ResIcon name="leaf" size={32} />,
    title: "Tend",
    body: "Collect leaves and sugar from your trails, farms and forage trips. Every ant on a trail or farm earns 2 a day.",
  },
  {
    icon: <ResIcon name="queen" size={32} />,
    title: "Feed",
    body: "Feed the queen with WIF at least once every 72 hours or she starves. Each feeding grows the colony and adds score.",
  },
  {
    icon: <ResIcon name="chamber" size={32} />,
    title: "Build",
    body: "Dig chambers to house more ants, lay trails, grow aphid farms and decide which ants work where.",
  },
  {
    icon: <span className="l-redicon"><PixelIcon name="raids" size={30} /></span>,
    title: "Raid",
    body: "Send your free ants to steal leaves and sugar from a neighbour, and guard when a neighbour comes for yours.",
  },
];

const ALERTS: { icon: ReactNode; title: string; body: string }[] = [
  {
    icon: <span className="l-redicon"><PixelIcon name="raids" size={30} /></span>,
    title: "Raids that finish themselves",
    body: "Launch a raid and walk away. When the guard window closes, the game's keeper opens the sealed target, waits for the drand round and settles it. You come back to the result.",
  },
  {
    icon: <PixelIcon name="bell" size={30} />,
    title: "A to-do bell",
    body: "The bell in the top bar counts what needs you: a raid to guard, a hungry queen, a full pantry. A red strip follows you round the app until you guard.",
  },
  {
    icon: <PixelIcon name="live" size={30} />,
    title: "Alerts on your phone",
    body: "Push alerts when you are raided, when a result is in, when the queen gets hungry and when foragers are home. Each one has its own switch.",
  },
  {
    icon: <PixelIcon name="telegram" size={30} />,
    title: "Alerts on Telegram",
    body: "Link your colony to the C0LONY bot from Settings. Every alert arrives as a picture card with a button straight to the right screen, with its own switches.",
  },
];

const FAQ: { q: string; a: ReactNode }[] = [
  {
    q: "Do I need a crypto wallet?",
    a: "No. Sign in with X or email and the game makes a wallet for you (through Privy), which you own. If you already have a wallet, you can connect it instead. You can look at the live numbers on this page without either.",
  },
  {
    q: "Do I pay gas?",
    a: "Gas on Robinhood Chain is paid in ETH. New players get a small starter top-up before their first transaction, and founding a colony also comes with a small gas drip from the Treasury. After that your game wallet pays for its own gas. Founding, feeding, speed-ups, shields and revives are never sponsored.",
  },
  {
    q: "Can I play on a phone and on a desktop?",
    a: "Yes, it is a web app that works in either. On a phone you can add it to your Home Screen (iPhone Safari: Share, then Add to Home Screen. Android Chrome: menu, then Install app). On iPhone that is also what lets it send push alerts. You can also get every alert on Telegram instead.",
  },
  {
    q: "How do I get WIF?",
    a: "Use Get WIF inside the game to swap ETH for WIF through the KyberSwap aggregator. A 0.5% fee on that swap is paid in ETH to the Treasury. If you play from your own wallet, you can also buy WIF on Pons, which opens in a new tab. Or bring WIF you already hold.",
  },
  {
    q: "Is the randomness fair?",
    a: (
      <>
        Raid rolls come from the drand evmnet beacon, and the contract checks the beacon's signature itself before it
        uses it. Nobody, including us, can pick or predict the roll. Every raid report links to its round so you can
        check it. <a href={DRAND_INFO}>See the beacon</a>.
      </>
    ),
  },
  {
    q: "Is it on testnet or mainnet?",
    a:
      NETWORK_NAME === "testnet"
        ? "Right now C0LONY runs on Robinhood Chain testnet with a test version of WIF, so you can learn the game for free. Mainnet with real WIF is the next step, and the mainnet contract addresses will be published on this page and in the repo when it launches."
        : "C0LONY runs on Robinhood Chain mainnet with real WIF. Every contract address is listed on this page and verified on the explorer.",
  },
  {
    q: "Do I have to stay online while a raid runs?",
    a: "No. A raid takes about four hours to land. The game's keeper reveals and settles every raid on its own, and push or Telegram alerts tell you when you are raided and when a result is in. If the keeper were ever down, you can still reveal and settle by hand from the app.",
  },
  {
    q: "Do I get my WIF back?",
    a: "No. WIF spent on founding, feeding, speed-ups, shields and revives is not refunded. 70% goes into the season pot, which is paid out to players at the end. 20% is burned and 10% goes to the Treasury. Prices are not final: the owner can tune them within hard caps.",
  },
];

export function Landing() {
  const guide = useGuide(true);
  return (
    <div className="l-page">
      <a className="l-skip" href="#main">Skip to content</a>
      <header className="l-top">
        <div className="l-wrap l-top__in">
          <a className="l-brand" href="#top" aria-label={`${BRAND.name} home`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={BRAND.logoCompact} width={244} height={56} alt="" />
          </a>
          <nav className="l-nav" aria-label="Sections">
            <a href="#how">How it works</a>
            <a href="#raids">Raids</a>
            <a href="#alerts">Alerts</a>
            <a href="#wif">WIF</a>
            <a href="#fair">Fair play</a>
            <a href="#faq">FAQ</a>
          </nav>
          <a className="c0-btn c0-btn--paper c0-btn--compact l-top__play" href={APP_URL}>Play</a>
        </div>
      </header>

      <Guide open={guide.open} onClose={guide.close} playHref={APP_URL} playLabel="Play C0LONY" />
      <main id="main">
        {/* 1. Hero */}
        <section className="l-hero" id="top" aria-labelledby="h-hero">
          <div className="l-wrap l-hero__in">
            <div className="l-hero__text">
              <p className="l-eyebrow">A DAILY ANT-COLONY GAME PAID IN $WIF</p>
              <h1 id="h-hero">Raise an ant colony. Raid your rivals.</h1>
              <p className="l-lead">
                <BrandName /> is a strategy game on Robinhood Chain. Feed your queen, grow your colony, steal leaves and
                sugar from neighbours, and share the season's WIF pot if your colony is still alive at the end.
              </p>
              <div className="l-cta">
                <PlayButton hero />
                <button type="button" className="c0-btn c0-btn--dark l-guide" onClick={guide.show}>
                  <span className="l-guide__play" aria-hidden="true" /> Watch the 1-minute guide
                </button>
              </div>
              <p className="l-reassure">
                <Hand size={18}>Sign in with X or email · a wallet is made for you · new players get starter gas</Hand>
              </p>
              <p className="l-fine">
                Signing in creates a wallet inside the game that you own. Nothing is spent until you found a colony, and
                you can look around first.
              </p>
            </div>
            <HeroWorld />
          </div>
          <div className="l-wrap">
            <LiveNumbers />
          </div>
        </section>

        {/* 2. A day in your colony */}
        <section className="l-band l-band--deep" id="how" aria-labelledby="h-how">
          <div className="l-wrap">
            <h2 id="h-how">A day in your colony</h2>
            <p className="l-sub">Four things to do. Come back once a day, and never leave the queen hungry for more than 72 hours.</p>
            <ol className="l-steps">
              {STEPS.map((s, i) => (
                <li key={s.title} className="c0-card l-step">
                  <span className="l-step__n" aria-hidden="true">{i + 1}</span>
                  <span className="l-step__icon">{s.icon}</span>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </li>
              ))}
            </ol>
            <p className="l-note">
              Season 1 ends 4 hours before the hackathon final closes, and later seasons last 10 days. When it ends, colonies that stayed alive share the pot by
              score.
            </p>
          </div>
        </section>

        {/* 3. Raids */}
        <section className="l-band" id="raids" aria-labelledby="h-raids">
          <div className="l-wrap l-split">
            <div>
              <h2 id="h-raids">Raids are a sealed guess</h2>
              <p className="l-sub">
                The raider picks leaves or sugar and seals the choice. For 4 hours the defender can guard against one of
                them. Then the beacon rolls, and the loot moves. Raids never move WIF.
              </p>
              <ol className="l-flow">
                <li><b>Seal.</b> The raider commits to a target without showing it. All their free ants march.</li>
                <li><b>Guard.</b> The defender has a 4 hour window to guard leaves or sugar.</li>
                <li><b>Reveal.</b> The seal opens itself: the target was timelocked to a drand round after the guard window. The roll is fixed to a later drand round.</li>
                <li><b>Roll.</b> Anyone can settle it. The contract checks the beacon signature and pays out.</li>
              </ol>
            </div>
            <div>
              <ul className="l-outcomes">
                <li className="c0-card">
                  <h3>No guard</h3>
                  <p>The raider wins and takes 30 to 60% of the target resource.</p>
                </li>
                <li className="c0-card">
                  <h3>Wrong guard</h3>
                  <p>The raider still wins and takes 45 to 60%. A wrong guess is worse than no guard.</p>
                </li>
                <li className="c0-card">
                  <h3>Right guard</h3>
                  <p>The raid fails. The raider loses a quarter of the marching ants and the defender takes 10 to 15% of a random resource from them.</p>
                </li>
              </ul>
              <p className="l-note">
                Loot is capped at 8 per marching ant. A raider can launch once per 12 hours and a raided colony is
                protected for 12 hours. If you lose a raid, <b>Avenge</b> gives you one free counter-raid for 24 hours.
              </p>
              <div className="c0-panel l-sample" aria-hidden="true">
                <div className="l-sample__top">
                  <span className="l-sample__title">Raid on a neighbour</span>
                  <span className="l-sample__time">waiting for the drand round</span>
                </div>
                <Tracker at="roll" progress={0.3} />
              </div>
              <p className="l-caption">Sample from the Raids tab</p>
            </div>
          </div>
        </section>

        {/* 3b. Set and forget */}
        <section className="l-band l-band--deep" id="alerts" aria-labelledby="h-alerts">
          <div className="l-wrap l-split">
            <div>
              <h2 id="h-alerts">Set it, then get on with your day</h2>
              <p className="l-sub">
                A raid takes hours to land, so <BrandName /> does the waiting for you and tells you when something needs
                your hand.
              </p>
              <ul className="l-alerts">
                {ALERTS.map((a) => (
                  <li key={a.title} className="c0-card l-alert">
                    <span className="l-alert__icon">{a.icon}</span>
                    <div>
                      <h3>{a.title}</h3>
                      <p>{withBrand(a.body)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="l-tgsample">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/tg/raided.png" width={800} height={400} alt="A C0LONY Telegram alert: raid incoming, guard leaves or sugar, with a Guard now button" />
              <span className="c0-btn c0-btn--paper c0-btn--compact l-tgsample__btn" aria-hidden="true">Guard now</span>
              <p className="l-caption">A Telegram alert{NETWORK.telegram ? "" : " (Telegram alerts open with the mainnet launch)"}</p>
            </div>
          </div>
        </section>

        {/* 4. WIF */}
        <section className="l-band" id="wif" aria-labelledby="h-wif">
          <div className="l-wrap">
            <h2 id="h-wif">Why WIF, and where it goes</h2>
            <p className="l-sub">
              Every paid action costs WIF. Playing grows the prize: most of what you spend goes straight into the pot
              that players share at the end.
            </p>
            <div className="l-split">
              <div>
                <h3 className="l-h3">Launch prices</h3>
                <dl className="l-prices">
                  <div><dt>Found a colony</dt><dd><Wif>1,500 WIF</Wif></dd></div>
                  <div><dt>Feed the queen</dt><dd><Wif>100 WIF</Wif></dd></div>
                  <div><dt>Speed up a forage</dt><dd><Wif>300 WIF</Wif></dd></div>
                  <div><dt>Shield · no new raids for 8 h</dt><dd><Wif>1,000 WIF</Wif></dd></div>
                  <div><dt>Revive a starving queen</dt><dd><Wif>2,000 WIF + 20 per worker</Wif></dd></div>
                </dl>
                <p className="l-note">
                  Prices are not final. The owner can tune each one within hard limits set in the contract (0.25x to 4x
                  the launch value), and every change is logged onchain. Players who voted with WIF in a World is Fair
                  event get 20% off founding and feeding.
                </p>
              </div>
              <div>
                <h3 className="l-h3">Every payment is split in the same transaction</h3>
                <div className="l-bar" role="img" aria-label="70 percent season pot, 20 percent burned, 10 percent treasury">
                  <span className="l-bar__pot" style={{ width: "70%" }}>70%</span>
                  <span className="l-bar__burn" style={{ width: "20%" }}>20%</span>
                  <span className="l-bar__tre" style={{ width: "10%" }}>10%</span>
                </div>
                <ul className="l-legend">
                  <li><span className="l-key l-key--pot" /> Season pot, paid to players</li>
                  <li><span className="l-key l-key--burn" /> Burned</li>
                  <li><span className="l-key l-key--tre" /> Treasury</li>
                </ul>
                <h3 className="l-h3">How the pot is paid</h3>
                <p className="l-body">
                  A colony qualifies if it was fed at least twice and its queen was fed within 72 hours of the season
                  end. Half of the pot is shared by score among all qualifying colonies. The other half is shared by
                  score among the top 25% of them. Anyone can also add WIF to the pot as a sponsor.
                </p>
                <div className="c0-card l-sample" aria-hidden="true">
                  <div className="l-sample__top">
                    <span className="l-sample__title l-sample__title--ink">THE QUEEN</span>
                    <span className="l-sample__time l-sample__time--ink">hungry in <b>71h 12m</b></span>
                  </div>
                  <Meter kind="queen" value={71} max={72} label="Queen fed time (sample)" />
                  <span className="c0-btn c0-btn--wif l-fake">Feed her · 100 WIF</span>
                </div>
                <p className="l-caption">Sample from the Colony tab</p>
              </div>
            </div>
          </div>
        </section>

        {/* 5. Fair and open */}
        <section className="l-band l-band--deep" id="fair" aria-labelledby="h-fair">
          <div className="l-wrap">
            <h2 id="h-fair">Fair and open</h2>
            <p className="l-sub">Specific things you can check yourself, and the honest limits.</p>
            <div className="l-trio">
              <div className="c0-card l-trust">
                <h3>Randomness you can verify</h3>
                <p>
                  Raid rolls come from the public drand evmnet beacon. Each round has exactly one valid signature, the
                  round is fixed in the future when the raid is revealed, and the contract verifies the signature onchain
                  before it rolls. Neither raider, defender nor settler can steer the result.
                </p>
                <a href={DRAND_INFO}>drand evmnet info ›</a>
              </div>
              <div className="c0-card l-trust">
                <h3>Contracts on the explorer</h3>
                <p>
                  {NETWORK_NAME === "testnet" ? "Current testnet deployment on " : "Deployed on "}
                  {NETWORK.name}, source verified.
                </p>
                <ul className="l-addrs">
                  {CONTRACTS.map(([name, addr]) => (
                    <li key={name}>
                      <span>{name}</span>
                      <a href={`${NETWORK.explorerUrl}/address/${addr}`}>{shortAddress(addr)}</a>
                    </li>
                  ))}
                </ul>
                <a href={REPO_URL}>Open source on GitHub ›</a>
              </div>
              <div className="c0-card l-trust">
                <h3>What the owner can and cannot do</h3>
                <ul className="l-list">
                  <li><b>Cannot</b> touch the season pot. WIF leaves it only to qualifying players, or rolls into a later season's pot.</li>
                  <li><b>Can</b> withdraw Treasury funds (its 10% share and swap fees). Every withdrawal is logged.</li>
                  <li><b>Can</b> tune prices and odds, but only within hard caps in the contract, and every change is logged.</li>
                </ul>
                <p className="l-fine l-fine--ink">
                  The review of these contracts is our own self-audit, not a third party's.{" "}
                  <a href={SECURITY_DOC}>Read it ›</a>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 6. FAQ */}
        <section className="l-band" id="faq" aria-labelledby="h-faq">
          <div className="l-wrap l-faqwrap">
            <h2 id="h-faq">Questions</h2>
            <div className="l-faq">
              {FAQ.map((f) => (
                <details key={f.q} className="l-q">
                  <summary>{f.q}</summary>
                  <p>{typeof f.a === "string" ? withBrand(f.a) : f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* 7. Final CTA */}
        <section className="l-band l-band--deep l-final" aria-labelledby="h-final">
          <div className="l-wrap l-final__in">
            <h2 id="h-final">Your queen is waiting.</h2>
            <p className="l-sub">Look around for free, found a colony when you are ready, and come back tomorrow.</p>
            <PlayButton hero />
            <p className="l-reassure"><Hand size={18}>Sign in with X or email · a wallet is made for you</Hand></p>
          </div>
        </section>
      </main>

      <footer className="l-foot">
        <div className="l-wrap l-foot__in">
          <p className="l-foot__brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={BRAND.logoCompact} width={244} height={56} alt={BRAND.name} />
          </p>
          <nav aria-label="Footer">
            <a href={APP_URL}>Play</a>
            <a href={REPO_URL}>GitHub</a>
            <a href={`${REPO_URL}/tree/main/docs`}>Docs</a>
            <a href={NETWORK.explorerUrl}>Explorer</a>
          </nav>
          <p className="l-fine">Built for the World is Flat hackathon. Prices and rules may change as the game is balanced.</p>
        </div>
      </footer>
    </div>
  );
}
