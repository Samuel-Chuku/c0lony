import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SITE } from "../../brand";
import { InviteScreen } from "../../screens/invite/InviteScreen";

export default function Page() {
  if (SITE !== "app") notFound();
  return (
    <Suspense>
      <InviteScreen />
    </Suspense>
  );
}
