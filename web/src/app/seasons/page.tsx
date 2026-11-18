import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SITE } from "../../brand";
import { SeasonsRoute } from "../../screens/history/SeasonResults";

export default function Page() {
  if (SITE !== "app") notFound();
  return (
    <Suspense>
      <SeasonsRoute />
    </Suspense>
  );
}
