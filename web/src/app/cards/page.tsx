import { notFound } from "next/navigation";
import { Cards } from "./Cards";

// Dev only: the Telegram alert picture cards, screenshotted into public/tg/<name>.png.
export default function CardsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Cards />;
}
