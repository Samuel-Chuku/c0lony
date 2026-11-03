import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SITE } from "../../brand";
import { AboutScreen } from "../../screens/about/AboutScreen";

export default function Page() {
  if (SITE !== "app") notFound();
  return (
    <Suspense>
      <AboutScreen />
    </Suspense>
  );
}
