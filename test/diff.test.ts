/**
 * Tests for diff module
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { computeDiff, type ParsedProfile } from "../src/diff/engine.js";
import { generateDiffMarkdown } from "../src/diff/markdown.js";

// Helper to create mock parsed profile
function createMockProfile(
  functions: Array<{ name: string; selfValue: number; cumValue: number }>
): ParsedProfile {
  const functionsMap = new Map();
  let totalValue = 0;

  for (const fn of functions) {
    const key = fn.name;
    functionsMap.set(key, {
      key,
      name: fn.name,
      selfValue: fn.selfValue,
      cumValue: fn.cumValue,
      samples: 1,
    });
    totalValue += fn.selfValue;
  }

  return {
    meta: {
      type: "cpu",
      samples: functions.length,
      totalValue,
    },
    functions: functionsMap,
    edges: new Map(),
    callPaths: new Map(),
    totalValue,
    totalSamples: functions.length,
  };
}

describe("diff engine", () => {
  describe("computeDiff", () => {
    it("should identify regressions", () => {
      const base = createMockProfile([
        { name: "funcA", selfValue: 100, cumValue: 100 },
        { name: "funcB", selfValue: 200, cumValue: 200 },
      ]);

      const current = createMockProfile([
        { name: "funcA", selfValue: 150, cumValue: 150 }, // +50
        { name: "funcB", selfValue: 200, cumValue: 200 }, // unchanged
      ]);

      const diff = computeDiff(base, current, { normalize: "none" });

      assert.strictEqual(diff.regressions.length, 1);
      assert.strictEqual(diff.regressions[0].function, "funcA");
      assert.strictEqual(diff.regressions[0].deltaSelf, 50);
    });

    it("should identify improvements", () => {
      const base = createMockProfile([
        { name: "funcA", selfValue: 200, cumValue: 200 },
      ]);

      const current = createMockProfile([
        { name: "funcA", selfValue: 100, cumValue: 100 }, // -100
      ]);

      const diff = computeDiff(base, current, { normalize: "none" });

      assert.strictEqual(diff.improvements.length, 1);
      assert.strictEqual(diff.improvements[0].function, "funcA");
      assert.strictEqual(diff.improvements[0].deltaSelf, -100);
    });

    it("should identify new functions", () => {
      const base = createMockProfile([
        { name: "funcA", selfValue: 100, cumValue: 100 },
      ]);

      const current = createMockProfile([
        { name: "funcA", selfValue: 100, cumValue: 100 },
        { name: "funcB", selfValue: 50, cumValue: 50 }, // new
      ]);

      const diff = computeDiff(base, current, { normalize: "none" });

      assert.ok(diff.newFunctions);
      assert.strictEqual(diff.newFunctions.length, 1);
      assert.strictEqual(diff.newFunctions[0].function, "funcB");
    });

    it("should identify removed functions", () => {
      const base = createMockProfile([
        { name: "funcA", selfValue: 100, cumValue: 100 },
        { name: "funcB", selfValue: 50, cumValue: 50 },
      ]);

      const current = createMockProfile([
        { name: "funcA", selfValue: 100, cumValue: 100 },
        // funcB removed
      ]);

      const diff = computeDiff(base, current, { normalize: "none" });

      assert.ok(diff.removedFunctions);
      assert.strictEqual(diff.removedFunctions.length, 1);
      assert.strictEqual(diff.removedFunctions[0].function, "funcB");
    });

    it("should apply scale-to-base-total normalization", () => {
      const base = createMockProfile([
        { name: "funcA", selfValue: 100, cumValue: 100 },
      ]);

      // Current has 2x total, but same structure
      const current = createMockProfile([
        { name: "funcA", selfValue: 200, cumValue: 200 },
      ]);

      const diff = computeDiff(base, current, { normalize: "scale-to-base-total" });

      // After scaling, current 200 * 0.5 = 100, so no change
      assert.strictEqual(diff.regressions.length, 0);
      assert.strictEqual(diff.improvements.length, 0);
    });
  });
});

describe("diff markdown", () => {
  describe("generateDiffMarkdown", () => {
    it("should generate summary format", () => {
      const base = createMockProfile([
        { name: "funcA", selfValue: 100, cumValue: 100 },
      ]);
      const current = createMockProfile([
        { name: "funcA", selfValue: 150, cumValue: 150 },
      ]);

      const diff = computeDiff(base, current, { normalize: "none" });
      const markdown = generateDiffMarkdown(diff, { format: "diff-summary" });

      assert.ok(markdown.includes("Profile Diff Summary"));
      assert.ok(markdown.includes("funcA"));
    });

    it("should generate adaptive format with anchors", () => {
      const base = createMockProfile([
        { name: "funcA", selfValue: 100, cumValue: 100 },
      ]);
      const current = createMockProfile([
        { name: "funcA", selfValue: 200, cumValue: 200 },
      ]);

      const diff = computeDiff(base, current, { normalize: "none" });
      const markdown = generateDiffMarkdown(diff, { format: "diff-adaptive" });

      assert.ok(markdown.includes("Profile Comparison Report"));
      assert.ok(markdown.includes("Executive Summary"));
      assert.ok(markdown.includes("<a id="));
    });
  });
});
