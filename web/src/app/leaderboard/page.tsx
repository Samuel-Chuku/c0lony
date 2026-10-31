import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SITE } from "../../brand";
import { LeaderboardScreen } from "../../screens/leaderboard/LeaderboardScreen";

export default function Page() {
  if (SITE !== "app") notFound();
  return (
    <Suspense>
      <LeaderboardScreen />
    </Suspense>
  );
}
