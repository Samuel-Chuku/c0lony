import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SITE } from "../../brand";
import { RaidReport } from "../../screens/raids/RaidReport";

export default function Page() {
  if (SITE !== "app") notFound();
  return (
    <Suspense>
      <RaidReport />
    </Suspense>
  );
}
