"use client";
import { useState } from "react";
import { BottomSheet, PixelIcon } from "../../ui";
import { NETWORK } from "../../config";
import "./wallet.css";

export function AddFundsSheet({ open, onClose, address }: { open: boolean; onClose: () => void; address: string | null }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <BottomSheet open={open} onClose={onClose} title="Add funds">
      <div className="c0-wsheet">
        <p className="c0-wsheet__note">Send ETH or WIF on {NETWORK.name} to this address.</p>
        <div className="c0-wsheet__addrrow">
          <div className="c0-wsheet__addr">{address}</div>
          <button type="button" className="c0-copybtn" onClick={copy} aria-label={copied ? "Address copied" : "Copy address"}>
            {copied ? <span className="c0-copybtn__done">Copied</span> : <PixelIcon name="copy" />}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
