import { BRAND, LANDING_URL } from "../brand";

// Placeholder app (app.c0lony.xyz): wallet connection and the four tabs land here.
export function Game() {
  return (
    <main>
      <header>
        <a href={LANDING_URL}>{BRAND.name}</a>
      </header>
      <p>Connect a wallet to found your colony. (Coming next.)</p>
    </main>
  );
}
