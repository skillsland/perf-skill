/**
 * Tests for LLM retry helper
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { withRetries } from "../src/llm/client.js";

describe("withRetries", () => {
  it("retries until success", async () => {
    let attempts = 0;
    const result = await withRetries(async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error("transient");
      }
      return "ok";
    }, { maxRetries: 2, baseDelayMs: 1, label: "test" });

    assert.strictEqual(result, "ok");
    assert.strictEqual(attempts, 3);
  });

  it("throws after exceeding retries", async () => {
    let attempts = 0;
    await assert.rejects(
      () => withRetries(async () => {
        attempts += 1;
        throw new Error("always");
      }, { maxRetries: 1, baseDelayMs: 1, label: "test" }),
      /always/
    );
    assert.strictEqual(attempts, 2);
  });
});
