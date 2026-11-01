"use client";
// Voter's Pass panel. The voting wallet signs a message saying "my pass goes to this game wallet"; the game
// wallet sends it. Using the pass directly from the voting wallet would use it up, so we link it instead.
import { useConnectWallet, useWallets } from "@privy-io/react-auth";
import { useState } from "react";
import type { Address, Hex } from "viem";
import { BottomSheet, Button } from "../../ui";
import { colonyGameAbi } from "../../lib/abi";
import { chain, publicClient } from "../../lib/chain";
import { GAME, useProfile } from "../../lib/game";
import { useSession } from "../../lib/session";
import { reasonOf, useAction, walletClientFor } from "../../lib/tx";
import { fetchVoterProof } from "../../lib/voter";
import { shortAddress } from "../../lib/format";
import "./settings.css";

export function VoterPass({ open, onClose }: { open: boolean; onClose: () => void }) {
  const session = useSession();
  const profile = useProfile(session.address);
  const linked = profile.data?.hasVoterPass;
  return (
    <BottomSheet open={open} onClose={onClose} title="Voter's Pass">
      <div className="c0-vp">
        {linked ? (
          <span className="c0-vp__ok">Voter's Pass linked · founding and feeding 20% off</span>
        ) : session.configured && session.address ? (
          <Link_ gameWallet={session.address} />
        ) : (
          <p>{session.configured ? "Sign in to link your Voter's Pass." : "Sign-in opens soon."}</p>
        )}
      </div>
    </BottomSheet>
  );
}

function Link_({ gameWallet }: { gameWallet: string }) {
  const { connectWallet } = useConnectWallet();
  const { wallets } = useWallets();
  const claim = useAction("Linking");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const voting = wallets.find((w) => w.walletClientType !== "privy" && w.address.toLowerCase() !== gameWallet.toLowerCase()) ?? null;

  async function link() {
    if (!voting) return;
    setWorking(true);
    setError(null);
    try {
      const found = await fetchVoterProof(voting.address);
      if (!found) {
        setError("That wallet isn't on the voter list yet. Votes are checked every 3 hours, so if you just voted, try again later. Otherwise connect the wallet you voted with.");
        return;
      }
      const nonce = await publicClient.readContract({ address: GAME, abi: colonyGameAbi, functionName: "voterNonce", args: [voting.address as Address] });
      const client = await walletClientFor(voting);
      const signature = await client.signTypedData({
        account: client.account,
        domain: { name: "C0LONY", version: "1", chainId: chain.id, verifyingContract: GAME },
        types: { LinkVoterPass: [{ name: "gameWallet", type: "address" }, { name: "nonce", type: "uint256" }] },
        primaryType: "LinkVoterPass",
        message: { gameWallet: gameWallet as Address, nonce },
      });
      setWorking(false);
      await claim.run({ functionName: "claimVoterPass", args: [voting.address, found.proof as Hex[], signature] });
    } catch (e) {
      setError(`Linking failed · ${reasonOf(e)}`);
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <p>Using the pass directly from the voting wallet uses it up, so link it to the wallet you play from.</p>
      <p className="c0-sub">Votes are checked every 3 hours. If you voted just now, your pass shows up within 3 hours.</p>
      {voting ? (
        <>
          <p>Voting wallet connected: {shortAddress(voting.address)}</p>
          <Button variant="paper" fullWidth busy={working || claim.busy ? "Linking…" : undefined} error={error ?? claim.error} onClick={() => void link()}>
            I voted in World is Fair: link my pass
          </Button>
        </>
      ) : (
        <Button variant="paper" fullWidth onClick={() => connectWallet()}>
          Connect your voting wallet
        </Button>
      )}
    </>
  );
}
