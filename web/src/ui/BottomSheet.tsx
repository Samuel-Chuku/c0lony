"use client";
import { useId, type ReactNode } from "react";
import { useDialog } from "./useDialog";

export type BottomSheetProps = { open: boolean; onClose: () => void; title: string; meta?: ReactNode; children: ReactNode };

export function BottomSheet({ open, onClose, title, meta, children }: BottomSheetProps) {
  const ref = useDialog<HTMLDivElement>(open, onClose);
  const titleId = useId();
  if (!open) return null;
  return (
    <div className="c0-dialog-root">
      <div className="c0-dim" onClick={onClose} aria-hidden="true" />
      <div className="c0-dialog-col">
        <div ref={ref} className="c0-sheet c0-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
          <div className="c0-sheet__grab" aria-hidden="true" />
          <div className="c0-sheet__head">
            <h2 className="c0-sheet__title" id={titleId}>{title}</h2>
            {meta ? <span className="c0-sheet__meta">{meta}</span> : null}
            <button type="button" className="c0-close" aria-label="Close" onClick={onClose}>×</button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
