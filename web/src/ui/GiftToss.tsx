// One ant tosses a WIF coin to another, in pixel steps, on a loop (still under reduced motion).
// Shown in the result window after "Send WIF to a colony" and when a player receives WIF.
import { ResIcon } from "./ResIcon";
import "./gift.css";

export function GiftToss() {
  return (
    <div className="c0-gift" aria-hidden="true">
      <span className="c0-gift__ant c0-gift__ant--from"><ResIcon name="ant" size={56} /></span>
      <span className="c0-gift__coin"><ResIcon name="wif" size={28} /></span>
      <span className="c0-gift__ant c0-gift__ant--to"><ResIcon name="ant" size={56} /></span>
      <span className="c0-gift__ground" />
    </div>
  );
}
