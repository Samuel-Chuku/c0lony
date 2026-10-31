"use client";
import { useState, type ReactNode } from "react";
import {
  Avatar, BlockedStrip, BottomNav, BottomSheet, Button, Card, Chip, ChipRow, Drawer, FeedRow, Hand, Header,
  ICON_NAMES, JournalRow, Meter, Modal, NeighbourRow, Panel, PixelIcon, SignLabel, StatRow, StatTile, Stepper,
  Switch, Underway, shortAddress, type NavTab,
} from "../../ui";
import { ColonyWorld } from "../../world/ColonyWorld";

const NOW = 1_800_000_000;
const HOUR = 3600;
const ADDR = "0x3f2a8c1d5b7e90a4c6d2e8f1a3b5c7d99c41";
const AVATAR = { src: "/icon-192.png", alt: "Sample avatar" };
const NO_AVATAR = { address: ADDR, alt: "No X linked" };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ padding: "16px 12px", display: "flex", flexDirection: "column", gap: 12 }}>
      <h2 style={{ margin: 0, fontFamily: "var(--c0-f-display)", fontWeight: 400, fontSize: 24, letterSpacing: 2, textTransform: "uppercase", color: "var(--c0-muted)" }}>{title}</h2>
      {children}
    </section>
  );
}

const noop = () => {};
const VARIANTS = ["wif", "raid", "paper", "dark"] as const;
const SIZES = ["default", "compact", "hero"] as const;

export function Styleguide() {
  const [tab, setTab] = useState<NavTab>("colony");
  const [steps, setSteps] = useState(3);
  const [on, setOn] = useState(true);
  const [off, setOff] = useState(false);
  const [chip, setChip] = useState("All");
  const [sheet, setSheet] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [modal, setModal] = useState(false);

  return (
    <div className="c0-app">
      <Section title="Buttons">
        {VARIANTS.map((v) =>
          SIZES.map((s) => (
            <Card key={`${v}-${s}`} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <strong>{v} · {s}</strong>
              <Button variant={v} size={s} icon="wif">Feed her · 100 WIF</Button>
              <Button variant={v} size={s} busy="Feeding…">Feed her</Button>
              <Button variant={v} size={s} disabledReason="You need 100 WIF · Buy WIF">Feed her · 100 WIF</Button>
              <Button variant={v} size={s} error="Feeding failed · not enough WIF. Buy WIF">Feed her · 100 WIF</Button>
              <Button variant={v} size={s} fullWidth>Full width</Button>
            </Card>
          )),
        )}
      </Section>

      <Section title="Icons">
        <Panel style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {ICON_NAMES.map((n) => (
            <div key={n} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, fontSize: 11 }}>
              <span style={{ display: "flex", gap: 8 }}><PixelIcon name={n} size={20} /><PixelIcon name={n} size={30} /></span>
              {n}
            </div>
          ))}
        </Panel>
      </Section>

      <Section title="Avatars">
        <Panel style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <Avatar {...AVATAR} size={40} /><Avatar {...AVATAR} size={56} /><Avatar {...AVATAR} size={64} />
          <Avatar {...NO_AVATAR} size={40} /><Avatar {...NO_AVATAR} size={56} /><Avatar {...NO_AVATAR} size={64} />
        </Panel>
        <span className="c0-muted">{shortAddress(ADDR)}</span>
      </Section>

      <Section title="Meters">
        <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Meter value={41} max={72} label="Queen fed" kind="queen" />
          <Meter value={30} max={100} label="Forage progress" kind="paper" />
          <Meter value={50} max={100} label="Waiting for drand" kind="underway" />
        </Card>
      </Section>

      <Section title="Stat tiles">
        <StatRow>
          <StatTile icon="ant" value="24/30" caption="ants" />
          <StatTile icon="chamber" value={6} caption="chambers" />
          <StatTile icon="leaf" value={3} caption="trails" />
          <StatTile icon="sugar" value={2} caption="farms" />
          <StatTile icon="shield" value={11} caption="free" />
        </StatRow>
      </Section>

      <Section title="Stepper and switches">
        <Card style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>On trails</span>
          <Stepper value={steps} min={0} max={5} onChange={setSteps} label="Ants on trails" decLabel="Fewer ants on trails" incLabel="More ants on trails" />
        </Card>
        <Panel>
          <Switch id="sg-on" label="Raided by another player" hint="Saved on this device" checked={on} onChange={setOn} />
          <Switch id="sg-off" label="Queen hungry in 2h" checked={off} onChange={setOff} />
        </Panel>
      </Section>

      <Section title="Sign labels and chips">
        <Panel style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <SignLabel>Store</SignLabel><SignLabel>Nursery</SignLabel><SignLabel>Queen</SignLabel><SignLabel>Aphids</SignLabel>
        </Panel>
        <ChipRow>
          {["All", "Raids", "Mine", "Pot"].map((c) => <Chip key={c} selected={chip === c} onClick={() => setChip(c)}>{c}</Chip>)}
        </ChipRow>
      </Section>

      <Section title="Header">
        <Header title="Your colony" sub="· Day 6 of 21" wifBalance="1,240" avatar={{ src: "/icon-192.png" }} onOpenMenu={() => setDrawer(true)} />
        <Header title="" back={{ onClick: noop }} avatar={{ address: ADDR }} onOpenMenu={() => setDrawer(true)} />
      </Section>

      <Section title="Bottom nav">
        <BottomNav active={tab} onSelect={setTab} />
      </Section>

      <Section title="Dialogs">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant="paper" onClick={() => setSheet(true)}>Open sheet</Button>
          <Button variant="paper" onClick={() => setDrawer(true)}>Open menu</Button>
          <Button variant="paper" onClick={() => setModal(true)}>Open pop-up</Button>
        </div>
      </Section>

      <Section title="Neighbour rows">
        <div className="c0-rows">
          <NeighbourRow avatar={AVATAR} handle="@mudlark_" line="24 ants · ~1,900 sugar" onOpenProfile={noop} action={{ kind: "raid", onClick: noop }} />
          <NeighbourRow avatar={NO_AVATAR} handle={shortAddress(ADDR)} line="12 ants · ~600 sugar" onOpenProfile={noop} action={{ kind: "cooldown", time: "2h 10m" }} />
          <NeighbourRow avatar={AVATAR} handle="@sugar_thief" line="31 ants · ~2,400 sugar" note="raided you · free avenge, 21h" isRaider onOpenProfile={noop} action={{ kind: "avenge", onClick: noop }} />
        </div>
      </Section>

      <Section title="Feed rows">
        <div className="c0-rows">
          <FeedRow avatar={AVATAR} kind="Raid won" kindTone="raid" timeAgo="4m ago" onOpenProfile={noop}><b>@sugar_thief</b> took sugar from <b>@mudlark_</b>.</FeedRow>
          <FeedRow avatar={NO_AVATAR} kind="Sponsor" kindTone="sub" timeAgo="1h ago" onOpenProfile={noop}><b>{shortAddress(ADDR)}</b> added 500 WIF to the pot.</FeedRow>
          <FeedRow avatar={AVATAR} kind="Defended" kindTone="sub" timeAgo="3h ago" own shareHref="https://x.com/intent/post" onOpenProfile={noop}>You guarded against <b>@sugar_thief</b>.</FeedRow>
        </div>
      </Section>

      <Section title="Journal rows">
        <Card>
          <JournalRow text="Fed the queen for 3 days" time="2h ago" />
          <JournalRow text="Dug a new chamber" time="yesterday" />
        </Card>
      </Section>

      <Section title="Global states">
        <BlockedStrip>Queen is hungry in 9h 20m</BlockedStrip>
        <Panel><Underway label="Marching · 3h 10m" /></Panel>
        <Hand size={17}>while you slept</Hand>
      </Section>

      <Section title="World">
        {([["fed 60h", 60], ["fed 36h", 36], ["fed 18h", 18], ["fed 6h", 6]] as const).map(([label, h]) => (
          <div key={label}>
            <span className="c0-muted">{label}</span>
            <ColonyWorld fedUntil={NOW + h * HOUR} now={NOW} counts={{ chambers: 6, trails: 3, farms: 2, ants: 24 }} onOpenBuild={() => setSheet(true)} />
          </div>
        ))}
        <span className="c0-muted">collapsed</span>
        <ColonyWorld fedUntil={null} now={NOW} collapsed />
        <span className="c0-muted">loading</span>
        <ColonyWorld fedUntil={null} now={NOW} state="loading" />
        <span className="c0-muted">error</span>
        <ColonyWorld fedUntil={null} now={NOW} state="error" />
      </Section>

      <BottomSheet open={sheet} onClose={() => setSheet(false)} title="Build" meta="240 leaves · 180 sugar">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 12 }}>
          <Card dense style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Panel style={{ width: 40, height: 40, padding: 8, boxSizing: "border-box" }}><PixelIcon name="chamber" /></Panel>
            <span style={{ flex: 1 }}>Chamber · houses 5 ants · 12 leaves</span>
            <Button variant="paper" size="compact">Dig</Button>
          </Card>
          <Button variant="paper" fullWidth>Save assignments</Button>
        </div>
      </BottomSheet>

      <Drawer open={drawer} onClose={() => setDrawer(false)} title="Menu">
        <Avatar {...AVATAR} size={56} />
        <Hand size={18}>view your profile ›</Hand>
        <Panel rule style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <span>WALLET</span>
          <Button variant="wif" fullWidth>Buy WIF</Button>
          <Button variant="paper" fullWidth>Copy address</Button>
        </Panel>
      </Drawer>

      <Modal open={modal} onClose={() => setModal(false)} title="While you were away" kicker="you were gone 14h">
        <JournalRow text="Raided by @sugar_thief" time="9h ago" />
        <JournalRow text="Trails and farms filled" time="3h ago" />
        <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 12 }}>
          <BlockedStrip>Queen is hungry in 9h 20m</BlockedStrip>
          <Button variant="wif" size="hero" fullWidth>Feed her · 100 WIF</Button>
          <Button variant="paper" fullWidth>Tend · collect all</Button>
        </div>
      </Modal>
    </div>
  );
}
