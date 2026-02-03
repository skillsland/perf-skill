/**
 * Update prompt fixtures for tests.
 */

import { writeFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { SYSTEM_PROMPT, buildAnalysisPrompt, buildDiffAnalysisPrompt } from "../src/llm/prompt.js";

const fixturesDir = join("test", "fixtures", "prompts");
mkdirSync(fixturesDir, { recursive: true });

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

writeFileSync(join(fixturesDir, "system_prompt.txt"), SYSTEM_PROMPT, "utf-8");
writeFileSync(
  join(fixturesDir, "analysis_prompt.txt"),
  buildAnalysisPrompt({ markdown: analysisMarkdown, profileType: "cpu", context }),
  "utf-8"
);
writeFileSync(
  join(fixturesDir, "diff_prompt.txt"),
  buildDiffAnalysisPrompt({ markdown: diffMarkdown, context }),
  "utf-8"
);

console.log("Updated prompt fixtures in", fixturesDir);
