/**
 * Tests for CLI option helpers
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import {
  buildAnalyzeOptions,
  buildConvertOptions,
  buildDiffOptions,
} from "../src/cli/options.js";

describe("cli options", () => {
  it("buildAnalyzeOptions respects --no-redact", () => {
    const options = buildAnalyzeOptions({
      format: "summary",
      type: "cpu",
      maxHotspots: "5",
      sourceDir: undefined,
      source: true,
      mode: "analyze",
      redact: false,
      service: "svc",
      scenario: "load test",
      slo: "p99 < 100ms",
      llmProvider: undefined,
      llmModel: undefined,
    });

    assert.strictEqual(options.redact, false);
  });

  it("buildConvertOptions respects --no-redact", () => {
    const options = buildConvertOptions({
      format: "summary",
      type: "cpu",
      maxHotspots: "5",
      sourceDir: undefined,
      source: false,
      redact: false,
    });

    assert.strictEqual(options.redact, false);
    assert.strictEqual(options.mode, "convert-only");
  });

  it("buildDiffOptions parses numeric limits", () => {
    const options = buildDiffOptions({
      format: "diff-summary",
      normalize: "none",
      maxRegressions: "7",
      maxImprovements: "3",
      maxDecompressedBytes: "2048",
    });

    assert.strictEqual(options.maxRegressions, 7);
    assert.strictEqual(options.maxImprovements, 3);
    assert.strictEqual(options.limits?.maxDecompressedBytes, 2048);
  });
});
