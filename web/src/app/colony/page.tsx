import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SITE } from "../../brand";
import { ProfileScreen } from "../../screens/profile/ProfileScreen";

export default function Page() {
  if (SITE !== "app") notFound();
  return (
    <Suspense>
      <ProfileScreen />
    </Suspense>
  );
}
