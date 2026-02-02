/**
 * LLM module exports
 */

export {
  createLLMClient,
  getDefaultLLMConfig,
  type LLMClient,
  type LLMResponse,
  type ChatMessage,
  type ChatOptions,
} from "./client.js";

export {
  SYSTEM_PROMPT,
  buildAnalysisPrompt,
  buildDiffAnalysisPrompt,
  buildRepairPrompt,
  buildTriagePrompt,
} from "./prompt.js";

export {
  AnalysisOutputSchema,
  DiffAnalysisOutputSchema,
  RecommendationSchema,
  HotspotAnalysisSchema,
  validateAnalysisOutput,
  validateDiffAnalysisOutput,
  getAnalysisJsonSchema,
  type AnalysisOutput,
  type DiffAnalysisOutput,
  type Recommendation,
  type HotspotAnalysis,
} from "./schema.js";

export {
  parseAnalysisOutput,
  parseDiffAnalysisOutput,
  repairJson,
  createFallbackResult,
  type ParseResult,
} from "./validate.js";
