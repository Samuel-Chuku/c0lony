import { notFound } from "next/navigation";
import { Styleguide } from "./Styleguide";

export default function StyleguidePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Styleguide />;
}
