"use client";
// The one-minute guide in the app. It opens by itself once per device for someone who isn't signed in (a first
// visit), from the Menu and How to play (openGuide), and on any page with ?guide=1.
import { useEffect } from "react";
import { Guide, useGuide } from "../guide/Guide";
import { useSession } from "../lib/session";

const EVENT = "c0lony:guide";

/** Opens the guide from anywhere in the app. */
export function openGuide() {
  window.dispatchEvent(new Event(EVENT));
}

export function GuideHost() {
  const session = useSession();
  const g = useGuide(session.ready && !session.signedIn);
  const { show } = g;
  useEffect(() => {
    window.addEventListener(EVENT, show);
    return () => window.removeEventListener(EVENT, show);
  }, [show]);
  return <Guide open={g.open} onClose={g.close} />;
}
