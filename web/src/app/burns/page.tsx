import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SITE } from "../../brand";
import { BurnsScreen } from "../../screens/season/Burns";

export default function Page() {
  if (SITE !== "app") notFound();
  return (
    <Suspense>
      <BurnsScreen />
    </Suspense>
  );
}
