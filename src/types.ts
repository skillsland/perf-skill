/**
 * Core types for perf-skill
 */

// Profile types
export type ProfileType = "cpu" | "heap" | "auto";
export type OutputFormat = "summary" | "detailed" | "adaptive";
export type DiffFormat = "diff-summary" | "diff-detailed" | "diff-adaptive";
export type NormalizeMode = "none" | "scale-to-base-total" | "per-second";

// Convert options (aligned with pprof-to-md)
export interface ConvertOptions {
  /** Output format: summary, detailed, or adaptive */
  format?: OutputFormat;
  /** Profile type: cpu, heap, or auto-detect */
  profileType?: ProfileType;
  /** Maximum number of hotspots to include */
  maxHotspots?: number;
  /** Source directory for code context */
  sourceDir?: string;
  /** Include source code in output */
  includeSource?: boolean;
}

// LLM provider configuration
export interface LLMConfig {
  provider: "openai" | "azure-openai" | "anthropic" | "custom";
  model: string;
  apiKey?: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
}

// Analysis context
export interface AnalysisContext {
  /** Service or application name */
  serviceName?: string;
  /** Scenario description (e.g., load test, production, specific API) */
  scenario?: string;
  /** Target SLO (e.g., p99 < 100ms) */
  targetSLO?: string;
  /** Environment (prod, staging, dev) */
  env?: string;
  /** Recent changes or deployment info */
  recentChanges?: string;
}

// Resource limits
export interface ResourceLimits {
  /** Maximum profile file size in bytes (compressed) */
  maxProfileBytes?: number;
  /** Maximum decompressed profile size in bytes */
  maxDecompressedBytes?: number;
  /** Maximum markdown output characters */
  maxMarkdownChars?: number;
  /** Maximum source lines per file */
  maxSourceLinesPerFile?: number;
  /** Processing timeout in milliseconds */
  timeoutMs?: number;
}

// Full analyze options
export interface AnalyzeOptions extends ConvertOptions {
  /** Mode: convert-only skips LLM, analyze includes recommendations */
  mode?: "convert-only" | "analyze";
  /** LLM configuration */
  llm?: LLMConfig;
  /** Analysis context */
  context?: AnalysisContext;
  /** Resource limits */
  limits?: ResourceLimits;
  /** Redact sensitive information */
  redact?: boolean;
}

// Diff options
export interface DiffOptions extends ConvertOptions {
  /** Diff output format */
  format?: DiffFormat | OutputFormat;
  /** Normalization mode for comparison */
  normalize?: NormalizeMode;
  /** Maximum regressions to show */
  maxRegressions?: number;
  /** Maximum improvements to show */
  maxImprovements?: number;
  /** Minimum absolute delta to report */
  minAbsoluteDelta?: number;
  /** Minimum percentage delta to report */
  minPercentDelta?: number;
  /** Disable inline frame expansion */
  noInlines?: boolean;
  /** Resource limits */
  limits?: ResourceLimits;
}

// Hotspot from profile analysis
export interface Hotspot {
  /** Rank by impact */
  rank: number;
  /** Function name */
  function: string;
  /** Self percentage (flat) */
  selfPct?: number;
  /** Cumulative percentage */
  cumPct?: number;
  /** Self value (samples/bytes) */
  selfValue?: number;
  /** Cumulative value */
  cumValue?: number;
  /** Source location (file:line) */
  location?: string;
  /** Call path from root to this function */
  callPath?: string[];
  /** Callers of this function */
  callers?: string[];
  /** Callees of this function */
  callees?: string[];
}

// LLM-generated recommendation
export interface Recommendation {
  /** Short title */
  title: string;
  /** Explanation with evidence from report */
  rationale: string;
  /** Concrete action steps */
  steps: string[];
  /** Expected performance impact */
  expectedImpact: "high" | "medium" | "low";
  /** Implementation risk */
  risk: "high" | "medium" | "low";
  /** Confidence level 0-1 */
  confidence: number;
  /** Related hotspot ranks */
  relatedHotspots?: number[];
}

// Profile metadata
export interface ProfileMeta {
  type?: "cpu" | "heap";
  /** Duration in seconds (for CPU profiles) */
  durationSec?: number;
  /** Total samples */
  samples?: number;
  /** Total value (samples for CPU, bytes for heap) */
  totalValue?: number;
  /** Sample type (e.g., "samples", "cpu", "alloc_space") */
  sampleType?: string;
  /** Value unit */
  unit?: string;
}

// Full analysis result
export interface AnalyzeResult {
  /** Profile metadata */
  profileMeta?: ProfileMeta;
  /** Final markdown report (may include LLM appendix) */
  markdown: string;
  /** Extracted hotspots */
  hotspots: Hotspot[];
  /** LLM-generated recommendations (if mode=analyze) */
  recommendations?: Recommendation[];
  /** Suggested next steps for validation */
  nextSteps?: string[];
  /** Raw outputs for debugging */
  raw?: {
    /** Original pprof-to-md output */
    pprofToMdMarkdown: string;
    /** Raw LLM JSON response */
    llmJson?: unknown;
    /** LLM parse errors if any */
    llmErrors?: string[];
  };
  /** Processing metrics */
  metrics?: {
    convertMs: number;
    llmMs?: number;
    totalMs: number;
    profileBytes: number;
    markdownChars: number;
  };
}

// Diff hotspot with delta information
export interface DiffHotspot extends Hotspot {
  /** Delta in self value */
  deltaSelf: number;
  /** Delta in cumulative value */
  deltaCum: number;
  /** Delta as percentage of base */
  deltaSelfPct: number;
  deltaCumPct: number;
  /** Base profile values */
  baseSelf?: number;
  baseCum?: number;
  baseSelfPct?: number;
  baseCumPct?: number;
  /** Current profile values */
  currentSelf?: number;
  currentCum?: number;
  currentSelfPct?: number;
  currentCumPct?: number;
  /** Change type */
  changeType: "regression" | "improvement" | "new" | "removed";
}

// Call path with delta
export interface DiffCallPath {
  /** Full path from root to leaf */
  path: string[];
  /** Delta value */
  deltaValue: number;
  /** Base value */
  baseValue?: number;
  /** Current value */
  currentValue?: number;
}

// Diff analysis result
export interface DiffResult {
  /** Base profile metadata */
  baseMeta?: ProfileMeta;
  /** Current profile metadata */
  currentMeta?: ProfileMeta;
  /** Markdown diff report */
  markdown: string;
  /** Top regressions (functions that got worse) */
  regressions: DiffHotspot[];
  /** Top improvements (functions that got better) */
  improvements: DiffHotspot[];
  /** New functions (not in base) */
  newFunctions?: DiffHotspot[];
  /** Removed functions (not in current) */
  removedFunctions?: DiffHotspot[];
  /** Executive summary points */
  summary: string[];
  /** Key regression call paths */
  regressionPaths?: DiffCallPath[];
  /** LLM recommendations if requested */
  recommendations?: Recommendation[];
  /** Processing metrics */
  metrics?: {
    parseBaseMs: number;
    parseCurrentMs: number;
    diffMs: number;
    llmMs?: number;
    totalMs: number;
  };
}

// Skill manifest for agent/platform integration
export interface SkillManifest {
  name: string;
  description: string;
  version: string;
  inputSchema: object;
  outputSchema: object;
}

// HTTP API request/response types
export interface AnalyzeRequest {
  /** Base64 encoded profile or file path */
  profile: string;
  /** Profile encoding type */
  profileEncoding?: "base64" | "path";
  /** Analysis options */
  options?: AnalyzeOptions;
}

export interface DiffRequest {
  /** Base profile (base64 or path) */
  baseProfile: string;
  /** Current profile (base64 or path) */
  currentProfile: string;
  /** Profile encoding type */
  profileEncoding?: "base64" | "path";
  /** Diff options */
  options?: DiffOptions & AnalyzeOptions;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}
