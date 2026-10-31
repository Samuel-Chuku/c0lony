import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SITE } from "../../brand";
import { SettingsScreen } from "../../screens/settings/SettingsScreen";

export default function Page() {
  if (SITE !== "app") notFound();
  return (
    <Suspense>
      <SettingsScreen />
    </Suspense>
  );
}
