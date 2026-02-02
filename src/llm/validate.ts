/**
 * LLM output validation and repair
 */

import { logger } from "../utils/logger.js";
import type { LLMClient, ChatMessage } from "./client.js";
import { SYSTEM_PROMPT, buildRepairPrompt } from "./prompt.js";
import {
  validateAnalysisOutput,
  validateDiffAnalysisOutput,
  type AnalysisOutput,
  type DiffAnalysisOutput,
} from "./schema.js";

export interface ParseResult<T> {
  success: boolean;
  data?: T;
  rawJson?: unknown;
  errors?: string[];
  repairAttempted?: boolean;
}

/**
 * Try to repair common JSON issues
 */
export function repairJson(input: string): string {
  let json = input.trim();
  
  // Extract JSON from markdown code blocks
  const codeBlockMatch = json.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    json = codeBlockMatch[1].trim();
  }
  
  // Remove trailing commas before } or ]
  json = json.replace(/,\s*([\]}])/g, "$1");
  
  // Fix unquoted keys (simple cases)
  json = json.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
  
  // Fix single quotes to double quotes
  json = json.replace(/'/g, '"');
  
  // Try to fix unterminated strings (very basic)
  const lines = json.split("\n");
  const fixedLines = lines.map((line) => {
    const colonMatch = line.match(/:\s*"([^"]*?)$/);
    if (colonMatch && !line.trim().endsWith(",") && !line.trim().endsWith("}") && !line.trim().endsWith("]")) {
      return line + '"';
    }
    return line;
  });
  json = fixedLines.join("\n");
  
  return json;
}

/**
 * Parse and validate analysis output from LLM
 */
export async function parseAnalysisOutput(
  rawContent: string,
  client?: LLMClient
): Promise<ParseResult<AnalysisOutput>> {
  // Try to parse as-is
  let json: unknown;
  let parseError: string | undefined;
  
  try {
    json = JSON.parse(rawContent);
  } catch (e) {
    parseError = e instanceof Error ? e.message : String(e);
    
    // Try repair
    try {
      const repaired = repairJson(rawContent);
      json = JSON.parse(repaired);
      logger.debug("JSON repair successful");
    } catch {
      logger.warn("JSON repair failed", { originalError: parseError });
    }
  }
  
  if (!json) {
    return {
      success: false,
      errors: [`Failed to parse JSON: ${parseError}`],
    };
  }
  
  // Validate against schema
  const validation = validateAnalysisOutput(json);
  
  if (validation.success) {
    return {
      success: true,
      data: validation.data,
      rawJson: json,
    };
  }
  
  logger.warn("LLM output validation failed", { errors: validation.errors });
  
  // Try LLM repair if client available
  if (client && validation.errors) {
    return attemptLLMRepair(rawContent, validation.errors, client);
  }
  
  return {
    success: false,
    rawJson: json,
    errors: validation.errors,
  };
}

/**
 * Parse and validate diff analysis output
 */
export async function parseDiffAnalysisOutput(
  rawContent: string,
  client?: LLMClient
): Promise<ParseResult<DiffAnalysisOutput>> {
  let json: unknown;
  
  try {
    json = JSON.parse(rawContent);
  } catch {
    try {
      json = JSON.parse(repairJson(rawContent));
    } catch {
      return {
        success: false,
        errors: ["Failed to parse JSON"],
      };
    }
  }
  
  const validation = validateDiffAnalysisOutput(json);
  
  if (validation.success) {
    return {
      success: true,
      data: validation.data,
      rawJson: json,
    };
  }
  
  if (client && validation.errors) {
    return attemptLLMRepairDiff(rawContent, validation.errors, client);
  }
  
  return {
    success: false,
    rawJson: json,
    errors: validation.errors,
  };
}

/**
 * Attempt to repair output using LLM
 */
async function attemptLLMRepair(
  originalOutput: string,
  errors: string[],
  client: LLMClient
): Promise<ParseResult<AnalysisOutput>> {
  logger.info("Attempting LLM repair of validation errors");
  
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildRepairPrompt(originalOutput, errors) },
  ];
  
  try {
    const response = await client.chat(messages, { jsonMode: true });
    
    let json: unknown;
    try {
      json = JSON.parse(response.content);
    } catch {
      json = JSON.parse(repairJson(response.content));
    }
    
    const validation = validateAnalysisOutput(json);
    
    if (validation.success) {
      logger.info("LLM repair successful");
      return {
        success: true,
        data: validation.data,
        rawJson: json,
        repairAttempted: true,
      };
    }
    
    logger.warn("LLM repair still has validation errors", { errors: validation.errors });
    return {
      success: false,
      rawJson: json,
      errors: validation.errors,
      repairAttempted: true,
    };
  } catch (error) {
    logger.error("LLM repair request failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      errors: [...errors, `Repair attempt failed: ${error}`],
      repairAttempted: true,
    };
  }
}

/**
 * Attempt to repair diff output using LLM
 */
async function attemptLLMRepairDiff(
  originalOutput: string,
  errors: string[],
  client: LLMClient
): Promise<ParseResult<DiffAnalysisOutput>> {
  logger.info("Attempting LLM repair of diff validation errors");
  
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildRepairPrompt(originalOutput, errors) },
  ];
  
  try {
    const response = await client.chat(messages, { jsonMode: true });
    
    let json: unknown;
    try {
      json = JSON.parse(response.content);
    } catch {
      json = JSON.parse(repairJson(response.content));
    }
    
    const validation = validateDiffAnalysisOutput(json);
    
    if (validation.success) {
      logger.info("LLM diff repair successful");
      return {
        success: true,
        data: validation.data,
        rawJson: json,
        repairAttempted: true,
      };
    }
    
    return {
      success: false,
      rawJson: json,
      errors: validation.errors,
      repairAttempted: true,
    };
  } catch (error) {
    return {
      success: false,
      errors: [...errors, `Repair attempt failed: ${error}`],
      repairAttempted: true,
    };
  }
}

/**
 * Create a fallback result when LLM analysis fails
 */
export function createFallbackResult(
  hotspots: Array<{ rank: number; function: string; selfPct?: number }>
): AnalysisOutput {
  const topHotspot = hotspots[0];
  
  return {
    summary: topHotspot
      ? `Top hotspot is \`${topHotspot.function}\` at ${topHotspot.selfPct?.toFixed(1) || "?"}% self-time. Manual review recommended.`
      : "Unable to generate automated analysis. Please review the profile manually.",
    recommendations: [
      {
        title: "Review top hotspots manually",
        rationale: "Automated analysis was unable to complete. The profile data is available in the markdown report.",
        steps: [
          "Review the hotspot list in the report",
          "Use `pprof` interactive mode for detailed exploration",
          "Consider running additional profiles with more samples",
        ],
        expectedImpact: "medium" as const,
        risk: "low" as const,
        confidence: 0.3,
      },
    ],
    nextSteps: [
      "Run the profile again with longer duration for more samples",
      "Use `--format=detailed` for full call tree visibility",
    ],
    caveats: [
      "This is a fallback result - automated LLM analysis did not complete successfully",
    ],
  };
}
