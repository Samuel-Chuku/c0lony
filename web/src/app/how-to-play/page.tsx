import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SITE } from "../../brand";
import { HowToPlayScreen } from "../../screens/howto/HowToPlayScreen";

export default function Page() {
  if (SITE !== "app") notFound();
  return (
    <Suspense>
      <HowToPlayScreen />
    </Suspense>
  );
}
