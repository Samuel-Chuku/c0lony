// The LI.FI quote check: a quote is only signed if every field points where it should.
import { test } from "node:test";
import assert from "node:assert/strict";
import { quotePasses, type Expect } from "../../src/lib/lifiCheck.ts";

const PLAYER = "0xd91F849Fea192276eeA5eaABE9AF0d317557BC73";
const WIF = "0x5173b8eA6923c2d40267890D45C46a3480954773";
const DIAMOND = "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const x: Expect = { srcId: 8453, lifi: DIAMOND, token: USDC_BASE, native: false, amount: 10_000_000n, player: PLAYER, home: 4663, wif: WIF };
const good = () => ({
  action: { fromChainId: 8453, toChainId: 4663, fromToken: { address: USDC_BASE }, toToken: { address: WIF.toLowerCase() }, fromAmount: "10000000", fromAddress: PLAYER.toLowerCase(), toAddress: PLAYER },
  estimate: { approvalAddress: DIAMOND },
  transactionRequest: { chainId: 8453, to: DIAMOND.toLowerCase(), data: "0x", value: "0x0" },
});

test("a correct quote passes (addresses compared without case)", () => assert.equal(quotePasses(good(), x), true));
test("refuses WIF going to another address", () => { const q = good(); q.action.toAddress = "0x000000000000000000000000000000000000dEaD"; assert.equal(quotePasses(q, x), false); });
test("refuses another destination token", () => { const q = good(); q.action.toToken.address = USDC_BASE; assert.equal(quotePasses(q, x), false); });
test("refuses another destination chain", () => { const q = good(); q.action.toChainId = 1; assert.equal(quotePasses(q, x), false); });
test("refuses a transaction to an unpinned contract", () => { const q = good(); q.transactionRequest.to = "0x000000000000000000000000000000000000bEEF"; assert.equal(quotePasses(q, x), false); });
test("refuses an approval for an unpinned spender", () => { const q = good(); q.estimate.approvalAddress = "0x000000000000000000000000000000000000bEEF"; assert.equal(quotePasses(q, x), false); });
test("refuses a different amount than the player chose", () => { const q = good(); q.action.fromAmount = "20000000"; assert.equal(quotePasses(q, x), false); });
test("refuses a transaction built for another chain", () => { const q = good(); q.transactionRequest.chainId = 42161; assert.equal(quotePasses(q, x), false); });
test("a native-token quote needs no approval address", () => {
  const q = good(); q.action.fromToken.address = "0x0000000000000000000000000000000000000000"; (q.estimate as { approvalAddress?: string }).approvalAddress = undefined;
  assert.equal(quotePasses(q, { ...x, token: "0x0000000000000000000000000000000000000000", native: true }), true);
});
test("a garbage response fails", () => assert.equal(quotePasses({}, x), false));
