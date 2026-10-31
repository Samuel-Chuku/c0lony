import { Suspense } from "react";
import { SITE } from "../brand";
import { Landing } from "../landing/Landing";
import { Home } from "../screens/Home";

// SITE is fixed at build time, so each static site only renders its own half.
export default function Page() {
  if (SITE !== "app") return <Landing />;
  return (
    <Suspense>
      <Home />
    </Suspense>
  );
}
