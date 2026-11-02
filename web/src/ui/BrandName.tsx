import { Fragment, type ReactNode } from "react";

/**
 * "C0LONY" as on-screen text. The pixel fonts draw 0 and O alike, so the zero gets a square pixel in its middle
 * (a dotted zero, like the filled zero in the logo). Screen readers still read the plain letters. Plain strings
 * (page titles, share text, aria labels) keep the bare name.
 */
export function BrandName() {
  return (
    <span className="c0-brand">
      C<span className="c0-zero">0</span>LONY
    </span>
  );
}

/** Puts BrandName wherever "C0LONY" appears in a sentence. */
export function withBrand(text: string): ReactNode {
  const parts = text.split("C0LONY");
  if (parts.length === 1) return text;
  return parts.map((p, i) => (
    <Fragment key={i}>
      {i > 0 ? <BrandName /> : null}
      {p}
    </Fragment>
  ));
}
