/**
 * Skill manifest for AI platform integration
 * 
 * This skill provides deterministic evidence extraction from pprof profiles.
 * The host agent (Claude/Cursor/etc.) should use this evidence to generate
 * optimization recommendations - the skill itself does not require LLM access.
 */

import type { SkillManifest } from "../types.js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Read version from package.json
function getPackageVersion(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const pkgPath = join(__dirname, "..", "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * Full skill manifest with JSON schemas
 */
export const SKILL_MANIFEST: SkillManifest = {
  name: "pprof_evidence_extractor",
  description: "Convert pprof .pb.gz profiles to structured Markdown and JSON evidence for performance analysis. Produces deterministic hotspots, call paths, and metrics that can be used by any agent to generate optimization recommendations. No external API dependencies required.",
  version: getPackageVersion(),
  inputSchema: {
    type: "object",
    oneOf: [
      {
        title: "Convert Profile to Evidence",
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
            description: "Output format for the markdown report",
          },
          profile_type: { 
            type: "string", 
            enum: ["cpu", "heap", "auto"],
            default: "auto",
            description: "Type of profile (auto-detected if not specified)",
          },
          max_hotspots: { 
            type: "integer", 
            minimum: 1, 
            maximum: 50,
            default: 10,
            description: "Maximum number of hotspots to include in output",
          },
          include_source: {
            type: "boolean",
            default: false,
            description: "Include source code snippets (requires source_dir)",
          },
          context: {
            type: "object",
            description: "Optional context to include in the output",
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
            description: "Normalization mode for comparing profiles of different durations",
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
    description: "Structured evidence for performance analysis. Use this data to generate recommendations.",
    properties: {
      markdown: { 
        type: "string",
        description: "Human-readable markdown report with hotspots and call paths",
      },
      profile_meta: {
        type: "object",
        description: "Metadata about the profile",
        properties: {
          type: { type: "string", enum: ["cpu", "heap"] },
          duration_sec: { type: "number" },
          samples: { type: "integer" },
          sample_type: { type: "string" },
          unit: { type: "string" },
          total_value: { type: "number" },
        },
      },
      hotspots: {
        type: "array",
        description: "Top functions by resource consumption, ranked by impact",
        items: {
          type: "object",
          properties: {
            rank: { type: "integer", description: "Rank by impact (1 = highest)" },
            function: { type: "string", description: "Function name" },
            self_pct: { type: "number", description: "Percentage of total spent in this function only" },
            cum_pct: { type: "number", description: "Percentage including callees" },
            self_value: { type: "number", description: "Absolute value (samples or bytes)" },
            cum_value: { type: "number" },
            location: { type: "string", description: "Source file:line if available" },
            call_path: { type: "array", items: { type: "string" }, description: "Call stack from root" },
            callers: { type: "array", items: { type: "string" } },
            callees: { type: "array", items: { type: "string" } },
          },
          required: ["rank", "function"],
        },
      },
      // Diff-specific fields
      regressions: {
        type: "array",
        description: "Functions that got slower (for diff analysis)",
        items: {
          type: "object",
          properties: {
            rank: { type: "integer" },
            function: { type: "string" },
            delta_self: { type: "number", description: "Change in self value" },
            delta_self_pct: { type: "number", description: "Change as percentage of total" },
            change_type: { type: "string", enum: ["regression", "improvement", "new", "removed"] },
          },
        },
      },
      improvements: {
        type: "array",
        description: "Functions that got faster (for diff analysis)",
        items: {
          type: "object",
        },
      },
      summary: {
        type: "array",
        items: { type: "string" },
        description: "Executive summary points (for diff analysis)",
      },
      metrics: {
        type: "object",
        description: "Processing metrics",
        properties: {
          convertMs: { type: "number" },
          totalMs: { type: "number" },
          profileBytes: { type: "number" },
          markdownChars: { type: "number" },
        },
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
