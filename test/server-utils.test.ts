/**
 * Tests for server utils
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { cleanupUploadedFiles, parseOptionsField } from "../src/server/utils.js";

describe("parseOptionsField", () => {
  it("parses JSON string options", () => {
    const result = parseOptionsField<{ format: string }>('{"format":"summary"}');
    assert.strictEqual(result.format, "summary");
  });

  it("accepts object options", () => {
    const result = parseOptionsField<{ mode: string }>({ mode: "analyze" });
    assert.strictEqual(result.mode, "analyze");
  });

  it("returns empty object for blank string", () => {
    const result = parseOptionsField<Record<string, never>>("   ");
    assert.deepStrictEqual(result, {});
  });

  it("throws on invalid JSON", () => {
    assert.throws(() => parseOptionsField("{bad"), /Invalid options JSON/);
  });
});

describe("cleanupUploadedFiles", () => {
  it("removes uploaded temp files", async () => {
    const filePath = join(tmpdir(), `perf-skill-test-${randomUUID()}.tmp`);
    await writeFile(filePath, "test");
    await cleanupUploadedFiles([{ filepath: filePath }]);
    await assert.rejects(stat(filePath));
  });
});
