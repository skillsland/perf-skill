/**
 * Prompt fixture tests (node:test)
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { SYSTEM_PROMPT, buildAnalysisPrompt, buildDiffAnalysisPrompt } from "../src/llm/prompt.js";

const fixturesDir = new URL("./fixtures/prompts/", import.meta.url);

function loadFixture(name: string): string {
  return readFileSync(new URL(name, fixturesDir), "utf-8");
}

describe("prompt fixtures", () => {
  it("system prompt matches fixture", () => {
    const fixture = loadFixture("system_prompt.txt");
    assert.strictEqual(SYSTEM_PROMPT, fixture);
  });

  it("analysis prompt matches fixture", () => {
    const analysisMarkdown = [
      "# PPROF Analysis: CPU",
      "",
      "**Duration:** 30s | **Samples:** 45,231",
      "",
      "## Top Hotspots",
      "",
      "| Rank | Function | Self% | Cum% | Location |",
      "| ---- | -------- | ----- | ---- | -------- |",
      "| 1 | `JSON.parse` | 23.4% | 23.4% | `<native>` |",
      "| 2 | `processRequest` | 15.2% | 67.8% | `handler.ts:142` |",
    ].join("\n");
    const context = {
      serviceName: "api-server",
      scenario: "load test",
      targetSLO: "p99 < 100ms",
      env: "staging",
      recentChanges: "v1.2.3 deploy",
    };

    const fixture = loadFixture("analysis_prompt.txt");
    const prompt = buildAnalysisPrompt({
      markdown: analysisMarkdown,
      profileType: "cpu",
      context,
    });

    assert.strictEqual(prompt, fixture);
  });

  it("diff prompt matches fixture", () => {
    const diffMarkdown = [
      "# Profile Comparison Report",
      "",
      "## Executive Summary",
      "",
      "- **Overall:** Performance regressed by ~10.0%",
      "",
      "## Top Regressions",
      "",
      "1. `JSON.parse` (+10.0%)",
    ].join("\n");
    const context = {
      serviceName: "api-server",
      scenario: "load test",
      targetSLO: "p99 < 100ms",
      env: "staging",
      recentChanges: "v1.2.3 deploy",
    };

    const fixture = loadFixture("diff_prompt.txt");
    const prompt = buildDiffAnalysisPrompt({ markdown: diffMarkdown, context });

    assert.strictEqual(prompt, fixture);
  });
});
