import { APP_URL, BRAND } from "../brand";

// Placeholder landing page (c0lony.xyz). The designed version replaces this.
export function Landing() {
  return (
    <main>
      <h1>{BRAND.name}</h1>
      <p>{BRAND.tagline}</p>
      <p>
        <a href={APP_URL}>Play {BRAND.name}</a>
      </p>
    </main>
  );
}
