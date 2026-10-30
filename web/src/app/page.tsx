import { SITE } from "../brand";
import { Landing } from "../landing/Landing";
import { Game } from "../game/Game";

// SITE is fixed at build time, so each static site only renders its own half.
export default function Home() {
  return SITE === "app" ? <Game /> : <Landing />;
}
