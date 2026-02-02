/**
 * Skill manifest for AI platform integration
 */

import type { SkillManifest } from "../types.js";

/**
 * Full skill manifest with JSON schemas
 */
export const SKILL_MANIFEST: SkillManifest = {
  name: "pprof_ai_analyzer",
  description: "Convert pprof .pb.gz profiles to Markdown and generate AI-powered performance recommendations. Supports CPU and heap profiling analysis, profile comparison/diff, and actionable optimization suggestions.",
  version: "1.0.0",
  inputSchema: {
    type: "object",
    oneOf: [
      {
        title: "Analyze Single Profile",
        properties: {
          action: { type: "string", const: "analyze" },
          profile_base64: { 
            type: "string",
            description: "Base64 encoded pprof profile (.pb.gz)",
          },
          profile_path: {
            type: "string",
            description: "Path to pprof profile file",
          },
          format: { 
            type: "string", 
            enum: ["summary", "detailed", "adaptive"],
            default: "adaptive",
          },
          profile_type: { 
            type: "string", 
            enum: ["cpu", "heap", "auto"],
            default: "auto",
          },
          max_hotspots: { 
            type: "integer", 
            minimum: 1, 
            maximum: 50,
            default: 10,
          },
          include_source: {
            type: "boolean",
            default: false,
          },
          mode: {
            type: "string",
            enum: ["convert-only", "analyze"],
            default: "analyze",
            description: "convert-only skips LLM analysis",
          },
          context: {
            type: "object",
            properties: {
              service_name: { type: "string" },
              scenario: { type: "string" },
              target_slo: { type: "string" },
              env: { type: "string" },
              recent_changes: { type: "string" },
            },
          },
        },
        required: [],
        oneOf: [
          { required: ["profile_base64"] },
          { required: ["profile_path"] },
        ],
      },
      {
        title: "Diff Two Profiles",
        properties: {
          action: { type: "string", const: "diff" },
          base_profile_base64: { type: "string" },
          base_profile_path: { type: "string" },
          current_profile_base64: { type: "string" },
          current_profile_path: { type: "string" },
          format: {
            type: "string",
            enum: ["diff-summary", "diff-detailed", "diff-adaptive"],
            default: "diff-adaptive",
          },
          normalize: {
            type: "string",
            enum: ["none", "scale-to-base-total", "per-second"],
            default: "scale-to-base-total",
          },
          max_regressions: {
            type: "integer",
            minimum: 1,
            maximum: 20,
            default: 10,
          },
          max_improvements: {
            type: "integer",
            minimum: 1,
            maximum: 20,
            default: 5,
          },
        },
        required: ["action"],
      },
    ],
  },
  outputSchema: {
    type: "object",
    properties: {
      markdown: { 
        type: "string",
        description: "Full markdown report",
      },
      profile_meta: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["cpu", "heap"] },
          duration_sec: { type: "number" },
          samples: { type: "integer" },
          sample_type: { type: "string" },
          unit: { type: "string" },
        },
      },
      hotspots: {
        type: "array",
        items: {
          type: "object",
          properties: {
            rank: { type: "integer" },
            function: { type: "string" },
            self_pct: { type: "number" },
            cum_pct: { type: "number" },
            location: { type: "string" },
            call_path: { type: "array", items: { type: "string" } },
          },
          required: ["rank", "function"],
        },
      },
      recommendations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            rationale: { type: "string" },
            steps: { type: "array", items: { type: "string" } },
            expected_impact: { type: "string", enum: ["high", "medium", "low"] },
            risk: { type: "string", enum: ["high", "medium", "low"] },
            confidence: { type: "number", minimum: 0, maximum: 1 },
          },
          required: ["title", "rationale", "steps", "expected_impact", "risk", "confidence"],
        },
      },
      next_steps: {
        type: "array",
        items: { type: "string" },
      },
      // Diff-specific fields
      regressions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            rank: { type: "integer" },
            function: { type: "string" },
            delta_self: { type: "number" },
            delta_self_pct: { type: "number" },
            change_type: { type: "string", enum: ["regression", "improvement", "new", "removed"] },
          },
        },
      },
      improvements: {
        type: "array",
        items: {
          type: "object",
        },
      },
      summary: {
        type: "array",
        items: { type: "string" },
        description: "Executive summary points for diff",
      },
    },
    required: ["markdown", "hotspots"],
  },
};

/**
 * Get manifest as JSON string
 */
export function getManifestJson(): string {
  return JSON.stringify(SKILL_MANIFEST, null, 2);
}

/**
 * Get simplified manifest for function calling
 */
export function getFunctionCallingManifest(): object {
  return {
    name: "analyze_pprof_profile",
    description: SKILL_MANIFEST.description,
    parameters: {
      type: "object",
      properties: {
        profile_base64: {
          type: "string",
          description: "Base64 encoded pprof profile (.pb.gz)",
        },
        format: {
          type: "string",
          enum: ["summary", "detailed", "adaptive"],
          description: "Output format (default: adaptive)",
        },
        profile_type: {
          type: "string",
          enum: ["cpu", "heap", "auto"],
          description: "Profile type (default: auto-detect)",
        },
        max_hotspots: {
          type: "integer",
          description: "Maximum hotspots to show (default: 10)",
        },
        service_name: {
          type: "string",
          description: "Name of the service being profiled",
        },
        scenario: {
          type: "string",
          description: "Scenario context (e.g., 'load test', 'production incident')",
        },
      },
      required: ["profile_base64"],
    },
  };
}
