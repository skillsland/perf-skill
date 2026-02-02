/**
 * Tests for LLM module
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import {
  validateAnalysisOutput,
  validateDiffAnalysisOutput,
} from "../src/llm/schema.js";
import { repairJson } from "../src/llm/validate.js";
import { buildAnalysisPrompt, buildDiffAnalysisPrompt } from "../src/llm/prompt.js";

describe("llm schema", () => {
  describe("validateAnalysisOutput", () => {
    it("should validate correct output", () => {
      const input = {
        summary: "The main bottleneck is JSON.parse at 23.4% self-time.",
        recommendations: [
          {
            title: "Use streaming JSON parser",
            rationale: "JSON.parse consumes 23.4% of CPU. Consider streaming for large payloads.",
            steps: ["Install streaming-json-parser", "Replace JSON.parse calls"],
            expectedImpact: "high",
            risk: "medium",
            confidence: 0.8,
          },
        ],
        nextSteps: ["Profile after change", "Monitor p99 latency"],
      };
      
      const result = validateAnalysisOutput(input);
      assert.strictEqual(result.success, true);
      assert.ok(result.data);
      assert.strictEqual(result.data.recommendations.length, 1);
    });

    it("should reject invalid output", () => {
      const input = {
        summary: "Test",
        // Missing recommendations
        nextSteps: [],
      };
      
      const result = validateAnalysisOutput(input);
      assert.strictEqual(result.success, false);
      assert.ok(result.errors);
    });

    it("should reject invalid confidence values", () => {
      const input = {
        summary: "Test",
        recommendations: [
          {
            title: "Test",
            rationale: "Test",
            steps: ["Step 1"],
            expectedImpact: "high",
            risk: "low",
            confidence: 1.5, // Invalid: > 1
          },
        ],
        nextSteps: ["Test"],
      };
      
      const result = validateAnalysisOutput(input);
      assert.strictEqual(result.success, false);
    });
  });

  describe("validateDiffAnalysisOutput", () => {
    it("should validate correct diff output", () => {
      const input = {
        summary: "Performance regressed by 15% due to new JSON parsing.",
        overallChange: "regression",
        recommendations: [
          {
            title: "Optimize new code path",
            rationale: "The new parseData function adds 15% CPU overhead.",
            steps: ["Review parseData implementation"],
            expectedImpact: "high",
            risk: "low",
            confidence: 0.9,
          },
        ],
      };
      
      const result = validateDiffAnalysisOutput(input);
      assert.strictEqual(result.success, true);
    });
  });
});

describe("llm validate", () => {
  describe("repairJson", () => {
    it("should remove trailing commas", () => {
      const input = '{"a": 1,}';
      const result = repairJson(input);
      assert.strictEqual(result, '{"a": 1}');
    });

    it("should extract JSON from markdown code blocks", () => {
      const input = '```json\n{"a": 1}\n```';
      const result = repairJson(input);
      assert.strictEqual(result, '{"a": 1}');
    });

    it("should handle already valid JSON", () => {
      const input = '{"valid": true}';
      const result = repairJson(input);
      assert.strictEqual(result, '{"valid": true}');
    });
  });
});

describe("llm prompt", () => {
  describe("buildAnalysisPrompt", () => {
    it("should include markdown report", () => {
      const prompt = buildAnalysisPrompt({
        markdown: "# Test Report\n\nHotspots here",
        profileType: "cpu",
      });
      
      assert.ok(prompt.includes("# Test Report"));
      assert.ok(prompt.includes("Hotspots here"));
    });

    it("should include context when provided", () => {
      const prompt = buildAnalysisPrompt({
        markdown: "Test",
        profileType: "cpu",
        context: {
          serviceName: "api-server",
          scenario: "load test",
        },
      });
      
      assert.ok(prompt.includes("api-server"));
      assert.ok(prompt.includes("load test"));
    });
  });

  describe("buildDiffAnalysisPrompt", () => {
    it("should format diff prompt correctly", () => {
      const prompt = buildDiffAnalysisPrompt({
        markdown: "# Diff Report\n\nRegressions here",
      });
      
      assert.ok(prompt.includes("Performance Comparison"));
      assert.ok(prompt.includes("Regressions here"));
    });
  });
});
