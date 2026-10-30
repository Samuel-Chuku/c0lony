import { test } from "node:test";
import assert from "node:assert/strict";
import { timestampSeconds, verifyQuicknodeSignature } from "../src/intake/hmac.ts";
import { sign } from "./helpers.ts";

test("accepts a correct Quicknode signature", () => {
  const sig = sign("token", "n1", "1730000000", '{"a":1}');
  assert.equal(verifyQuicknodeSignature("token", '{"a":1}', "n1", "1730000000", sig), true);
});

test("rejects wrong token, tampered body, nonce or timestamp", () => {
  const sig = sign("token", "n1", "1730000000", '{"a":1}');
  assert.equal(verifyQuicknodeSignature("other", '{"a":1}', "n1", "1730000000", sig), false);
  assert.equal(verifyQuicknodeSignature("token", '{"a":2}', "n1", "1730000000", sig), false);
  assert.equal(verifyQuicknodeSignature("token", '{"a":1}', "n2", "1730000000", sig), false);
  assert.equal(verifyQuicknodeSignature("token", '{"a":1}', "n1", "1730000001", sig), false);
});

test("rejects malformed or empty signatures without throwing", () => {
  assert.equal(verifyQuicknodeSignature("token", "x", "n", "1", "zz"), false);
  assert.equal(verifyQuicknodeSignature("token", "x", "n", "1", "abcd"), false);
  assert.equal(verifyQuicknodeSignature("", "x", "n", "1", "abcd"), false);
});

test("timestamps in seconds or milliseconds", () => {
  assert.equal(timestampSeconds("1730000000"), 1730000000);
  assert.equal(timestampSeconds("1730000000123"), 1730000000);
});
