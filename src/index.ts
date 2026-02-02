/**
 * perf-skill - AI-powered pprof profile analysis
 *
 * Convert .pb.gz profiles to LLM-friendly Markdown and generate
 * structured performance recommendations.
 */

// Re-export types
export type {
  ProfileType,
  OutputFormat,
  DiffFormat,
  NormalizeMode,
  ConvertOptions,
  AnalyzeOptions,
  DiffOptions,
  LLMConfig,
  AnalysisContext,
  ResourceLimits,
  Hotspot,
  Recommendation,
  ProfileMeta,
  AnalyzeResult,
  DiffHotspot,
  DiffCallPath,
  DiffResult,
  SkillManifest,
  AnalyzeRequest,
  DiffRequest,
  ApiResponse,
} from "./types.js";

// Re-export convert module
export {
  convertProfileToMarkdown,
  convertProfileFromPath,
  convertProfileFromBase64,
  sanitizeMarkdown,
  extractHotspots,
  extractProfileMeta,
  enrichHotspots,
  cleanForLLM,
} from "./convert/index.js";

// Re-export LLM module
export {
  createLLMClient,
  getDefaultLLMConfig,
  SYSTEM_PROMPT,
  buildAnalysisPrompt,
  buildDiffAnalysisPrompt,
  AnalysisOutputSchema,
  DiffAnalysisOutputSchema,
  parseAnalysisOutput,
  parseDiffAnalysisOutput,
} from "./llm/index.js";

// Re-export diff module
export {
  parseProfile,
  computeDiff,
  diffProfiles,
  generateDiffMarkdown,
} from "./diff/index.js";

// Re-export skill module
export {
  handleAnalyzeProfile,
  handleDiffProfiles,
  handleQuickTriage,
  getSkillCapabilities,
  SKILL_MANIFEST,
  getManifestJson,
  getFunctionCallingManifest,
} from "./skill/index.js";

// Re-export utilities
export { logger, setLogLevel } from "./utils/logger.js";
export { 
  resolveLimits, 
  DEFAULT_LIMITS,
  formatBytes,
  formatDuration,
  withTimeout,
} from "./utils/limits.js";
export {
  withTempFile,
  loadProfile,
  base64ToBuffer,
  bufferToBase64,
} from "./utils/fs.js";

// Import for main functions
import { convertProfileToMarkdown, type ConvertResult } from "./convert/index.js";
import { 
  createLLMClient, 
  getDefaultLLMConfig,
  SYSTEM_PROMPT,
  buildAnalysisPrompt,
  buildDiffAnalysisPrompt,
  parseAnalysisOutput,
  parseDiffAnalysisOutput,
  createFallbackResult,
} from "./llm/index.js";
import { diffProfiles, generateDiffMarkdown, type DiffData } from "./diff/index.js";
import { enrichHotspots } from "./convert/index.js";
import { loadProfile } from "./utils/fs.js";
import { logger } from "./utils/logger.js";
import type { 
  AnalyzeOptions, 
  AnalyzeResult, 
  DiffOptions, 
  DiffResult,
  Recommendation,
} from "./types.js";

/**
 * Analyze a pprof profile with optional LLM-powered recommendations
 *
 * @example
 * ```typescript
 * import { analyze } from 'perf-skill';
 *
 * // Convert only (no LLM)
 * const result = await analyze('cpu.pb.gz', { mode: 'convert-only' });
 * console.log(result.markdown);
 *
 * // Full analysis with recommendations
 * const fullResult = await analyze('cpu.pb.gz', {
 *   mode: 'analyze',
 *   context: { serviceName: 'api-server', scenario: 'load test' }
 * });
 * console.log(fullResult.recommendations);
 * ```
 */
export async function analyze(
  profile: string | Buffer | Uint8Array,
  options: AnalyzeOptions = {}
): Promise<AnalyzeResult> {
  const startTime = performance.now();
  
  // Load profile if path
  const profileData = typeof profile === "string"
    ? await loadProfile(profile, "path")
    : Buffer.from(profile);
  
  // Convert to markdown
  const convertResult = await convertProfileToMarkdown(profileData, {
    format: options.format,
    profileType: options.profileType,
    maxHotspots: options.maxHotspots,
    sourceDir: options.sourceDir,
    includeSource: options.includeSource,
    maxProfileBytes: options.limits?.maxProfileBytes,
    maxMarkdownChars: options.limits?.maxMarkdownChars,
    sanitize: {
      redactSecrets: options.redact,
      normalizePaths: options.redact,
      baseDir: options.sourceDir,
    },
  });
  
  // Enrich hotspots with call path info
  const enrichedHotspots = enrichHotspots(convertResult.hotspots, convertResult.markdown);
  
  // If convert-only mode, return without LLM analysis
  if (options.mode === "convert-only") {
    return {
      profileMeta: convertResult.meta,
      markdown: convertResult.markdown,
      hotspots: enrichedHotspots,
      raw: {
        pprofToMdMarkdown: convertResult.rawMarkdown,
      },
      metrics: {
        convertMs: convertResult.durationMs,
        totalMs: performance.now() - startTime,
        profileBytes: profileData.length,
        markdownChars: convertResult.markdown.length,
      },
    };
  }
  
  // LLM analysis
  const llmStartTime = performance.now();
  let recommendations: Recommendation[] | undefined;
  let nextSteps: string[] | undefined;
  let llmJson: unknown;
  let llmErrors: string[] | undefined;
  
  try {
    const llmConfig = options.llm || getDefaultLLMConfig();
    const client = createLLMClient(llmConfig);
    
    const prompt = buildAnalysisPrompt({
      markdown: convertResult.markdown,
      profileType: options.profileType || "auto",
      context: options.context,
    });
    
    const response = await client.chat([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ], { jsonMode: true });
    
    const parseResult = await parseAnalysisOutput(response.content, client);
    
    if (parseResult.success && parseResult.data) {
      recommendations = parseResult.data.recommendations;
      nextSteps = parseResult.data.nextSteps;
      llmJson = parseResult.rawJson;
    } else {
      llmErrors = parseResult.errors;
      // Use fallback
      const fallback = createFallbackResult(enrichedHotspots);
      recommendations = fallback.recommendations;
      nextSteps = fallback.nextSteps;
    }
  } catch (error) {
    logger.error("LLM analysis failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    llmErrors = [error instanceof Error ? error.message : String(error)];
    // Use fallback
    const fallback = createFallbackResult(enrichedHotspots);
    recommendations = fallback.recommendations;
    nextSteps = fallback.nextSteps;
  }
  
  const llmMs = performance.now() - llmStartTime;
  
  // Build final markdown with recommendations appendix
  let finalMarkdown = convertResult.markdown;
  if (recommendations && recommendations.length > 0) {
    finalMarkdown += "\n\n---\n\n## AI-Generated Recommendations\n\n";
    for (let i = 0; i < recommendations.length; i++) {
      const rec = recommendations[i];
      finalMarkdown += `### ${i + 1}. ${rec.title}\n\n`;
      finalMarkdown += `**Rationale:** ${rec.rationale}\n\n`;
      finalMarkdown += `**Steps:**\n`;
      for (const step of rec.steps) {
        finalMarkdown += `- ${step}\n`;
      }
      finalMarkdown += `\n**Impact:** ${rec.expectedImpact} | **Risk:** ${rec.risk} | **Confidence:** ${(rec.confidence * 100).toFixed(0)}%\n\n`;
    }
  }
  
  return {
    profileMeta: convertResult.meta,
    markdown: finalMarkdown,
    hotspots: enrichedHotspots,
    recommendations,
    nextSteps,
    raw: {
      pprofToMdMarkdown: convertResult.rawMarkdown,
      llmJson,
      llmErrors,
    },
    metrics: {
      convertMs: convertResult.durationMs,
      llmMs,
      totalMs: performance.now() - startTime,
      profileBytes: profileData.length,
      markdownChars: finalMarkdown.length,
    },
  };
}

/**
 * Compare two pprof profiles and generate a diff report
 *
 * @example
 * ```typescript
 * import { diff } from 'perf-skill';
 *
 * const result = await diff('base.pb.gz', 'current.pb.gz', {
 *   normalize: 'scale-to-base-total'
 * });
 *
 * console.log(`Found ${result.regressions.length} regressions`);
 * console.log(result.markdown);
 * ```
 */
export async function diff(
  baseProfile: string | Buffer | Uint8Array,
  currentProfile: string | Buffer | Uint8Array,
  options: DiffOptions = {}
): Promise<DiffResult> {
  const startTime = performance.now();
  
  // Load profiles if paths
  const baseData = typeof baseProfile === "string"
    ? await loadProfile(baseProfile, "path")
    : Buffer.from(baseProfile);
  
  const currentData = typeof currentProfile === "string"
    ? await loadProfile(currentProfile, "path")
    : Buffer.from(currentProfile);
  
  // Compute diff
  const diffData = await diffProfiles(baseData, currentData, options);
  
  // Generate markdown
  const markdown = generateDiffMarkdown(diffData, {
    format: (options.format as "diff-summary" | "diff-detailed" | "diff-adaptive") || "diff-adaptive",
    maxRegressions: options.maxRegressions,
    maxImprovements: options.maxImprovements,
  });
  
  // Extract summary points
  const summary = generateSummaryPoints(diffData);
  
  // Convert regression paths to array format
  const regressionPaths = diffData.regressions.slice(0, 5).flatMap((reg) => {
    const paths = diffData.regressionPaths.get(reg.function);
    return paths || [];
  });
  
  return {
    baseMeta: diffData.baseMeta,
    currentMeta: diffData.currentMeta,
    markdown,
    regressions: diffData.regressions,
    improvements: diffData.improvements,
    newFunctions: diffData.newFunctions,
    removedFunctions: diffData.removedFunctions,
    summary,
    regressionPaths,
    metrics: {
      parseBaseMs: 0, // TODO: track individually
      parseCurrentMs: 0,
      diffMs: 0,
      totalMs: performance.now() - startTime,
    },
  };
}

/**
 * Generate summary points from diff data
 */
function generateSummaryPoints(diffData: DiffData): string[] {
  const points: string[] = [];
  
  const totalDelta = (diffData.currentMeta.totalValue || 0) * diffData.scale - (diffData.baseMeta.totalValue || 0);
  const totalBasePct = diffData.baseMeta.totalValue ? (totalDelta / diffData.baseMeta.totalValue) * 100 : 0;
  
  if (Math.abs(totalBasePct) < 1) {
    points.push("Overall performance is roughly unchanged (< 1% delta)");
  } else if (totalDelta > 0) {
    points.push(`Overall performance regressed by ~${totalBasePct.toFixed(1)}%`);
  } else {
    points.push(`Overall performance improved by ~${Math.abs(totalBasePct).toFixed(1)}%`);
  }
  
  if (diffData.regressions.length > 0) {
    const top = diffData.regressions[0];
    points.push(`Largest regression: ${top.function} (+${top.deltaSelfPct.toFixed(1)}% of total)`);
  }
  
  if (diffData.improvements.length > 0) {
    const top = diffData.improvements[0];
    points.push(`Largest improvement: ${top.function} (${top.deltaSelfPct.toFixed(1)}% of total)`);
  }
  
  points.push(`Found ${diffData.regressions.length} regressions and ${diffData.improvements.length} improvements`);
  
  return points;
}
