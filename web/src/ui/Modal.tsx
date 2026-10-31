"use client";
import { useId, type ReactNode } from "react";
import { Hand } from "./Hand";
import { useDialog } from "./useDialog";

export type ModalProps = { open: boolean; onClose: () => void; title: string; kicker?: ReactNode; children: ReactNode };

export function Modal({ open, onClose, title, kicker, children }: ModalProps) {
  const ref = useDialog<HTMLDivElement>(open, onClose);
  const titleId = useId();
  if (!open) return null;
  return (
    <div className="c0-dialog-root">
      <div className="c0-dim" onClick={onClose} aria-hidden="true" />
      <div className="c0-dialog-col">
        <div ref={ref} className="c0-modal c0-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
          <div className="c0-modal__head">
            <div className="c0-modal__titles">
              {kicker ? <Hand size={17}>{kicker}</Hand> : null}
              <h2 className="c0-modal__title" id={titleId}>{title}</h2>
            </div>
            <button type="button" className="c0-close" aria-label="Close" onClick={onClose}>×</button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
