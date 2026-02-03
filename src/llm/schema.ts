/**
 * Zod schemas for LLM output validation
 */

import { z } from "zod";

/**
 * Hotspot analysis from LLM
 */
export const HotspotAnalysisSchema = z.object({
  rank: z.number().int().positive(),
  function: z.string(),
  rootCause: z.string().optional().describe("Likely root cause of high CPU/memory usage"),
  callPathAnalysis: z.string().optional().describe("Analysis of the call path leading to this hotspot"),
  optimizationPotential: z.enum(["high", "medium", "low"]).optional(),
});

export type HotspotAnalysis = z.infer<typeof HotspotAnalysisSchema>;

/**
 * Recommendation from LLM
 */
export const RecommendationSchema = z.object({
  title: z.string().max(100).describe("Short, actionable title"),
  rationale: z.string().describe("Explanation with evidence from the report (function names, percentages, locations)"),
  steps: z.array(z.string()).min(1).max(10).describe("Concrete action steps"),
  expectedImpact: z.enum(["high", "medium", "low"]).describe("Expected performance improvement"),
  risk: z.enum(["high", "medium", "low"]).describe("Implementation risk"),
  confidence: z.number().min(0).max(1).describe("Confidence level (0-1) based on evidence quality"),
  relatedHotspots: z.array(z.number()).optional().describe("Related hotspot ranks"),
});

export type Recommendation = z.infer<typeof RecommendationSchema>;

/**
 * Full LLM analysis output
 */
export const AnalysisOutputSchema = z.object({
  summary: z.string().max(500).describe("One paragraph executive summary"),
  profileType: z.enum(["cpu", "heap"]).optional(),
  hotspotAnalysis: z.array(HotspotAnalysisSchema).optional(),
  recommendations: z.array(RecommendationSchema).min(1).max(10),
  nextSteps: z.array(z.string()).max(5).describe("Validation experiments or metrics to track"),
  caveats: z.array(z.string()).optional().describe("Limitations or uncertainties in the analysis"),
});

export type AnalysisOutput = z.infer<typeof AnalysisOutputSchema>;

/**
 * Diff analysis output from LLM
 */
export const DiffAnalysisOutputSchema = z.object({
  summary: z.string().max(500).describe("Executive summary of the performance change"),
  overallChange: z.enum(["regression", "improvement", "mixed", "unchanged"]),
  changePercentage: z.number().optional().describe("Overall change as percentage"),
  primaryCause: z.string().optional().describe("Primary cause of the change"),
  regressionAnalysis: z.array(z.object({
    function: z.string(),
    explanation: z.string().describe("Why this function got slower"),
    likelyCause: z.enum(["new_code", "increased_calls", "slower_callees", "data_change", "unknown"]),
  })).optional(),
  improvementAnalysis: z.array(z.object({
    function: z.string(),
    explanation: z.string().describe("Why this function improved"),
  })).optional(),
  recommendations: z.array(RecommendationSchema).max(5),
  riskAssessment: z.string().optional().describe("Risk if this change goes to production"),
});

export type DiffAnalysisOutput = z.infer<typeof DiffAnalysisOutputSchema>;

/**
 * Validate LLM output against schema
 */
export function validateAnalysisOutput(data: unknown): {
  success: boolean;
  data?: AnalysisOutput;
  errors?: string[];
} {
  const result = AnalysisOutputSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const issues = result.error.issues;
  return {
    success: false,
    errors: issues.map((e) => `${e.path.join(".")}: ${e.message}`),
  };
}

/**
 * Validate diff analysis output
 */
export function validateDiffAnalysisOutput(data: unknown): {
  success: boolean;
  data?: DiffAnalysisOutput;
  errors?: string[];
} {
  const result = DiffAnalysisOutputSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const issues = result.error.issues;
  return {
    success: false,
    errors: issues.map((e) => `${e.path.join(".")}: ${e.message}`),
  };
}

/**
 * Get JSON Schema from Zod schema (for LLM function calling)
 */
export function getAnalysisJsonSchema(): object {
  return {
    type: "object",
    properties: {
      summary: { type: "string", maxLength: 500 },
      profileType: { type: "string", enum: ["cpu", "heap"] },
      hotspotAnalysis: {
        type: "array",
        items: {
          type: "object",
          properties: {
            rank: { type: "integer" },
            function: { type: "string" },
            rootCause: { type: "string" },
            callPathAnalysis: { type: "string" },
            optimizationPotential: { type: "string", enum: ["high", "medium", "low"] },
          },
          required: ["rank", "function"],
        },
      },
      recommendations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string", maxLength: 100 },
            rationale: { type: "string" },
            steps: { type: "array", items: { type: "string" } },
            expectedImpact: { type: "string", enum: ["high", "medium", "low"] },
            risk: { type: "string", enum: ["high", "medium", "low"] },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            relatedHotspots: { type: "array", items: { type: "integer" } },
          },
          required: ["title", "rationale", "steps", "expectedImpact", "risk", "confidence"],
        },
      },
      nextSteps: { type: "array", items: { type: "string" } },
      caveats: { type: "array", items: { type: "string" } },
    },
    required: ["summary", "recommendations", "nextSteps"],
  };
}
