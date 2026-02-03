/**
 * CLI option builders (pure helpers for testing)
 */

import type { AnalyzeOptions, DiffOptions, LLMConfig, ResourceLimits } from "../types.js";

export interface AnalyzeCommandOptions {
  format: AnalyzeOptions["format"];
  type: AnalyzeOptions["profileType"];
  maxHotspots: string;
  sourceDir?: string;
  source?: boolean;
  mode: AnalyzeOptions["mode"];
  redact: boolean;
  service?: string;
  scenario?: string;
  slo?: string;
  llmProvider?: LLMConfig["provider"];
  llmModel?: string;
}

export interface ConvertCommandOptions {
  format: AnalyzeOptions["format"];
  type: AnalyzeOptions["profileType"];
  maxHotspots: string;
  sourceDir?: string;
  source?: boolean;
  redact: boolean;
}

export interface DiffCommandOptions {
  format: DiffOptions["format"];
  normalize: DiffOptions["normalize"];
  maxRegressions: string;
  maxImprovements: string;
  maxDecompressedBytes?: string;
}

function parseOptionalInt(value?: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function buildLimits(opts: { maxDecompressedBytes?: string }): ResourceLimits | undefined {
  const maxDecompressedBytes = parseOptionalInt(opts.maxDecompressedBytes);
  if (maxDecompressedBytes === undefined) {
    return undefined;
  }
  return { maxDecompressedBytes };
}

export function buildAnalyzeOptions(opts: AnalyzeCommandOptions): AnalyzeOptions {
  return {
    format: opts.format,
    profileType: opts.type,
    maxHotspots: parseInt(opts.maxHotspots, 10),
    sourceDir: opts.sourceDir,
    includeSource: opts.source,
    mode: opts.mode,
    redact: opts.redact,
    context: {
      serviceName: opts.service,
      scenario: opts.scenario,
      targetSLO: opts.slo,
    },
  };
}

export function buildConvertOptions(opts: ConvertCommandOptions): AnalyzeOptions {
  return {
    format: opts.format,
    profileType: opts.type,
    maxHotspots: parseInt(opts.maxHotspots, 10),
    sourceDir: opts.sourceDir,
    includeSource: opts.source,
    mode: "convert-only",
    redact: opts.redact,
  };
}

export function buildDiffOptions(opts: DiffCommandOptions): DiffOptions {
  const limits = buildLimits(opts);
  return {
    format: opts.format,
    normalize: opts.normalize,
    maxRegressions: parseInt(opts.maxRegressions, 10),
    maxImprovements: parseInt(opts.maxImprovements, 10),
    limits,
  };
}
