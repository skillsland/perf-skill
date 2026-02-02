/**
 * LLM prompt templates for performance analysis
 */

import type { AnalysisContext } from "../types.js";

/**
 * System prompt for performance analysis
 */
export const SYSTEM_PROMPT = `You are a senior performance engineer specializing in Node.js/JavaScript performance optimization.

Your task is to analyze pprof profiling reports and provide actionable recommendations.

CRITICAL RULES:
1. ONLY use evidence present in the report (function names, percentages, file locations, call paths)
2. Do NOT invent or hallucinate file paths, line numbers, or function names that are not in the report
3. Every recommendation MUST reference specific evidence from the report
4. Be conservative with confidence scores - only high confidence if evidence is strong
5. Distinguish between CPU and heap (memory) analysis - they require different strategies

For CPU profiles, focus on:
- Functions with high self-time (flat) - these are doing actual work
- Functions with high cumulative time - these may be bottleneck entry points
- Recursive or repeated call patterns
- Native functions that suggest slow operations (JSON.parse, regex, etc.)

For Heap profiles, focus on:
- Functions with high allocation rates
- Potential memory leaks (retained objects growing over time)
- Inefficient data structures
- Objects that could be pooled or reused

Always structure your response as valid JSON matching the provided schema.`;

/**
 * Build analysis prompt for a single profile
 */
export function buildAnalysisPrompt(args: {
  markdown: string;
  profileType: "cpu" | "heap" | "auto";
  context?: AnalysisContext;
}): string {
  const contextSection = args.context
    ? `## Analysis Context

- **Service:** ${args.context.serviceName || "Unknown"}
- **Scenario:** ${args.context.scenario || "Not specified"}
- **Target SLO:** ${args.context.targetSLO || "Not specified"}
- **Environment:** ${args.context.env || "Not specified"}
${args.context.recentChanges ? `- **Recent Changes:** ${args.context.recentChanges}` : ""}
`
    : "";

  const profileTypeHint = args.profileType !== "auto"
    ? `\n**Profile Type:** ${args.profileType.toUpperCase()}\n`
    : "";

  return `${contextSection}${profileTypeHint}
## Profiling Report

Analyze the following pprof Markdown report and produce a structured JSON analysis.

\`\`\`markdown
${args.markdown}
\`\`\`

## Required Output

Provide a JSON object with:
1. **summary**: One paragraph executive summary of findings
2. **recommendations**: Array of actionable recommendations (1-5 items), each with:
   - title: Short action title
   - rationale: Explanation with specific evidence from report
   - steps: Concrete implementation steps
   - expectedImpact: high/medium/low
   - risk: high/medium/low  
   - confidence: 0-1 based on evidence quality
3. **nextSteps**: Array of validation experiments or metrics to track

Remember: Only reference functions, percentages, and locations that appear in the report above.`;
}

/**
 * Build prompt for diff analysis
 */
export function buildDiffAnalysisPrompt(args: {
  markdown: string;
  context?: AnalysisContext;
}): string {
  const contextSection = args.context
    ? `## Analysis Context

- **Service:** ${args.context.serviceName || "Unknown"}
- **Scenario:** ${args.context.scenario || "Not specified"}
- **Target SLO:** ${args.context.targetSLO || "Not specified"}
- **Environment:** ${args.context.env || "Not specified"}
${args.context.recentChanges ? `- **Recent Changes:** ${args.context.recentChanges}` : ""}
`
    : "";

  return `${contextSection}
## Performance Comparison Report

Analyze the following profile comparison report and explain why performance changed.

\`\`\`markdown
${args.markdown}
\`\`\`

## Required Output

Provide a JSON object with:
1. **summary**: Executive summary of the performance change
2. **overallChange**: "regression" | "improvement" | "mixed" | "unchanged"
3. **primaryCause**: Main cause of the change (if identifiable)
4. **regressionAnalysis**: For each major regression, explain:
   - function: The function name
   - explanation: Why it got slower
   - likelyCause: "new_code" | "increased_calls" | "slower_callees" | "data_change" | "unknown"
5. **recommendations**: Top 1-3 actionable fixes for regressions
6. **riskAssessment**: Risk if this change goes to production

Focus on the DELTA values and call path changes to identify root causes.`;
}

/**
 * Build repair prompt when LLM output fails validation
 */
export function buildRepairPrompt(
  originalOutput: string,
  errors: string[]
): string {
  return `Your previous response had JSON validation errors:

${errors.map((e) => `- ${e}`).join("\n")}

Original response:
\`\`\`json
${originalOutput}
\`\`\`

Please fix the JSON to match the required schema. Common fixes:
- Ensure all required fields are present
- Ensure arrays have at least 1 item where required
- Ensure numbers are within valid ranges (confidence: 0-1)
- Ensure enums use valid values

Return ONLY the corrected JSON, no explanation.`;
}

/**
 * Build prompt for quick triage (shorter, faster)
 */
export function buildTriagePrompt(markdown: string): string {
  return `Quick triage of this profile:

${markdown}

In 2-3 sentences, identify:
1. The #1 optimization opportunity
2. Estimated effort (easy/medium/hard)
3. Expected impact (high/medium/low)

Be direct and specific.`;
}
