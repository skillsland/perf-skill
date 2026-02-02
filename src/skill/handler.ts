/**
 * Skill handler - main entry point for AI agent integration
 */

import { analyze, diff } from "../index.js";
import type {
  AnalyzeOptions,
  DiffOptions,
  AnalyzeResult,
  DiffResult,
  AnalysisContext,
} from "../types.js";
import { loadProfile } from "../utils/fs.js";
import { logger } from "../utils/logger.js";

/**
 * Skill input for profile analysis
 */
export interface AnalyzeProfileInput {
  /** Base64 encoded profile or file path */
  profile: string;
  /** Whether profile is base64 encoded */
  isBase64?: boolean;
  /** Output format */
  format?: "summary" | "detailed" | "adaptive";
  /** Profile type */
  profileType?: "cpu" | "heap" | "auto";
  /** Maximum hotspots to include */
  maxHotspots?: number;
  /** Source directory for code context */
  sourceDir?: string;
  /** Include source code */
  includeSource?: boolean;
  /** Analysis mode */
  mode?: "convert-only" | "analyze";
  /** Context for analysis */
  context?: AnalysisContext;
  /** Redact sensitive info */
  redact?: boolean;
}

/**
 * Skill input for profile diff
 */
export interface DiffProfileInput {
  /** Base profile (base64 or path) */
  baseProfile: string;
  /** Current profile (base64 or path) */
  currentProfile: string;
  /** Whether profiles are base64 encoded */
  isBase64?: boolean;
  /** Output format */
  format?: "diff-summary" | "diff-detailed" | "diff-adaptive";
  /** Normalization mode */
  normalize?: "none" | "scale-to-base-total" | "per-second";
  /** Maximum regressions to show */
  maxRegressions?: number;
  /** Maximum improvements to show */
  maxImprovements?: number;
  /** Context for analysis */
  context?: AnalysisContext;
}

/**
 * Handle profile analysis request from AI agent
 */
export async function handleAnalyzeProfile(
  input: AnalyzeProfileInput
): Promise<AnalyzeResult> {
  logger.info("Skill: analyze profile", {
    isBase64: input.isBase64,
    format: input.format,
    mode: input.mode,
  });

  // Load profile
  const profileData = input.isBase64
    ? await loadProfile(input.profile, "base64")
    : await loadProfile(input.profile, "path");

  // Build options
  const options: AnalyzeOptions = {
    format: input.format,
    profileType: input.profileType,
    maxHotspots: input.maxHotspots,
    sourceDir: input.sourceDir,
    includeSource: input.includeSource,
    mode: input.mode,
    context: input.context,
    redact: input.redact ?? true,
  };

  return analyze(profileData, options);
}

/**
 * Handle profile diff request from AI agent
 */
export async function handleDiffProfiles(
  input: DiffProfileInput
): Promise<DiffResult> {
  logger.info("Skill: diff profiles", {
    isBase64: input.isBase64,
    format: input.format,
    normalize: input.normalize,
  });

  // Load profiles
  const encoding = input.isBase64 ? "base64" : "path";
  const baseData = await loadProfile(input.baseProfile, encoding);
  const currentData = await loadProfile(input.currentProfile, encoding);

  // Build options
  const options: DiffOptions = {
    format: input.format,
    normalize: input.normalize,
    maxRegressions: input.maxRegressions,
    maxImprovements: input.maxImprovements,
  };

  return diff(baseData, currentData, options);
}

/**
 * Quick triage - fast analysis without LLM
 */
export async function handleQuickTriage(
  profile: string | Buffer,
  options: { isBase64?: boolean } = {}
): Promise<{
  markdown: string;
  topHotspot: string | null;
  hotspotsCount: number;
}> {
  const profileData = typeof profile === "string"
    ? options.isBase64
      ? await loadProfile(profile, "base64")
      : await loadProfile(profile, "path")
    : profile;

  const result = await analyze(profileData, {
    mode: "convert-only",
    format: "summary",
    maxHotspots: 5,
    includeSource: false,
  });

  return {
    markdown: result.markdown,
    topHotspot: result.hotspots[0]?.function ?? null,
    hotspotsCount: result.hotspots.length,
  };
}

/**
 * List available skill capabilities
 */
export function getSkillCapabilities(): {
  name: string;
  version: string;
  capabilities: string[];
} {
  return {
    name: "perf-skill",
    version: "1.0.0",
    capabilities: [
      "analyze-profile",
      "diff-profiles",
      "quick-triage",
      "convert-to-markdown",
    ],
  };
}
