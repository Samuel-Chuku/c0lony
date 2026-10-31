"use client";
import { BottomSheet } from "../../ui";
import { NETWORK } from "../../config";
import "./wallet.css";

export function AddFundsSheet({ open, onClose, address }: { open: boolean; onClose: () => void; address: string | null }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Add funds">
      <div className="c0-wsheet">
        <p className="c0-wsheet__note">Send ETH or WIF on {NETWORK.name} to this address.</p>
        <div className="c0-wsheet__addr">{address}</div>
      </div>
    </BottomSheet>
  );
}
