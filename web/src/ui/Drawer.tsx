"use client";
import { useId, type ReactNode } from "react";
import { useDialog } from "./useDialog";

export type DrawerProps = { open: boolean; onClose: () => void; title: string; children: ReactNode };

export function Drawer({ open, onClose, title, children }: DrawerProps) {
  const ref = useDialog<HTMLDivElement>(open, onClose);
  const titleId = useId();
  if (!open) return null;
  return (
    <div className="c0-dialog-root">
      <div className="c0-dim" onClick={onClose} aria-hidden="true" />
      <div className="c0-dialog-col">
        <div ref={ref} className="c0-drawer c0-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
          <span className="c0-sr" id={titleId}>{title}</span>
          <div className="c0-drawer__close">
            <button type="button" className="c0-close" aria-label="Close" onClick={onClose}>×</button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
