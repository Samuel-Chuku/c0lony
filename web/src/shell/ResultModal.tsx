"use client";
// The result of the last action: what happened, the key numbers, and a link to the transaction.
import { Button, Modal } from "../ui";
import { txUrl } from "../lib/chain";
import { closeResult, useResult } from "../lib/result";

export function ResultModal() {
  const r = useResult();
  if (!r) return null;
  return (
    <Modal open onClose={closeResult} title={r.title} kicker={r.failed ? "it didn't go through" : undefined}>
      <div className="c0-result">
        {r.lines && r.lines.length > 0 ? (
          <ul className="c0-result__lines">
            {r.lines.map((l, i) => (
              <li key={i} className={r.tone === "raid" && i === 0 ? "c0-result__line c0-result__line--raid" : "c0-result__line"}>{l}</li>
            ))}
          </ul>
        ) : null}
        {r.hash ? (
          <a className="c0-result__tx" href={txUrl(r.hash)} target="_blank" rel="noreferrer">View transaction</a>
        ) : null}
        <Button variant="paper" fullWidth onClick={closeResult}>OK</Button>
      </div>
    </Modal>
  );
}
