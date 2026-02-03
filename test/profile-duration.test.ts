import { describe, it } from "node:test";
import assert from "node:assert";
import { parseDurationMs } from "../src/profile/duration.js";

describe("parseDurationMs", () => {
  it("uses fallback for empty input", () => {
    assert.strictEqual(parseDurationMs(undefined, 10000), 10000);
    assert.strictEqual(parseDurationMs("", 5000), 5000);
  });

  it("parses millisecond values", () => {
    assert.strictEqual(parseDurationMs("250ms", 10000), 250);
    assert.strictEqual(parseDurationMs("500", 10000), 500);
  });

  it("parses seconds and minutes", () => {
    assert.strictEqual(parseDurationMs("10s", 10000), 10000);
    assert.strictEqual(parseDurationMs("2m", 10000), 120000);
  });

  it("rejects invalid values", () => {
    assert.throws(() => parseDurationMs("abc", 10000));
    assert.throws(() => parseDurationMs("-5s", 10000));
  });
});
