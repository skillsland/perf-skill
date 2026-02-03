/**
 * Tests for fs utilities
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { compressGzip, decompressIfNeeded, getProfileExtension } from "../src/utils/fs.js";

describe("fs utils", () => {
  it("getProfileExtension detects gzip", () => {
    const data = Buffer.from("profile");
    const gz = compressGzip(data);
    assert.strictEqual(getProfileExtension(gz), ".pb.gz");
    assert.strictEqual(getProfileExtension(data), ".pb");
  });

  it("decompressIfNeeded enforces max output size", () => {
    const data = Buffer.from("this is longer than ten bytes");
    const gz = compressGzip(data);
    assert.throws(() => decompressIfNeeded(gz, 10));
  });
});
