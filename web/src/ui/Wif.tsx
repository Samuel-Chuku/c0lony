import type { ReactNode } from "react";
import { ResIcon } from "./ResIcon";

/** A WIF amount with the coin in front: <Wif>{fmtWif(x)}</Wif> renders "(coin) 1,500 WIF". */
export function Wif({ children, size = 16 }: { children: ReactNode; size?: number }) {
  return (
    <span className="c0-wif">
      <ResIcon name="wif" size={size} />
      {children} WIF
    </span>
  );
}
