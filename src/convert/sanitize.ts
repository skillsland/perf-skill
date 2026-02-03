/**
 * Markdown sanitization and post-processing
 * 
 * Handles:
 * - Truncation to stay within token limits
 * - Path redaction/normalization
 * - Secret masking
 * - Anchor stabilization
 */

import { relative, normalize, sep } from "node:path";

export interface SanitizeOptions {
  /** Maximum total characters */
  maxChars?: number;
  /** Maximum lines per source code block */
  maxSourceLines?: number;
  /** Base directory for path normalization */
  baseDir?: string;
  /** Redact sensitive patterns */
  redactSecrets?: boolean;
  /** Replace absolute paths with relative */
  normalizePaths?: boolean;
  /** Custom patterns to redact */
  customRedactPatterns?: RegExp[];
}

// Common secret patterns
const SECRET_PATTERNS = [
  // AWS keys
  /AKIA[0-9A-Z]{16}/g,
  // Bearer tokens
  /Bearer\s+[a-zA-Z0-9\-._~+\/]+=*/g,
  // Private keys
  /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
  // Generic API keys (long alphanumeric strings)
  /(?:api[_-]?key|apikey|secret|token|password|passwd|pwd)["']?\s*[:=]\s*["']?[a-zA-Z0-9\-._]{20,}["']?/gi,
  // JWT tokens
  /eyJ[a-zA-Z0-9\-_]+\.eyJ[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_.+\/=]*/g,
];

/**
 * Sanitize markdown content
 */
export function sanitizeMarkdown(
  markdown: string,
  options: SanitizeOptions = {}
): string {
  let result = markdown;
  
  // Redact secrets
  if (options.redactSecrets !== false) {
    result = redactSecrets(result, options.customRedactPatterns);
  }
  
  // Normalize paths
  if (options.normalizePaths !== false && options.baseDir) {
    result = normalizePaths(result, options.baseDir);
  }
  
  // Truncate source code blocks
  if (options.maxSourceLines) {
    result = truncateSourceBlocks(result, options.maxSourceLines);
  }
  
  // Truncate overall content
  if (options.maxChars && result.length > options.maxChars) {
    result = truncateContent(result, options.maxChars);
  }
  
  // Stabilize anchors for consistent linking
  result = stabilizeAnchors(result);
  
  return result;
}

/**
 * Redact sensitive information
 */
export function redactSecrets(
  content: string,
  customPatterns: RegExp[] = []
): string {
  let result = content;
  
  const patterns = [...SECRET_PATTERNS, ...customPatterns];
  
  for (const pattern of patterns) {
    result = result.replace(pattern, "[REDACTED]");
  }
  
  return result;
}

/**
 * Convert absolute paths to relative paths
 */
export function normalizePaths(content: string, baseDir: string): string {
  const normalizedBase = normalize(baseDir);
  
  // Match common path patterns
  const pathPattern = new RegExp(
    escapeRegex(normalizedBase) + "[^\\s\\)\\]\\>\\`]*",
    "g"
  );
  
  return content.replace(pathPattern, (match) => {
    try {
      const relativePath = relative(normalizedBase, match);
      // Normalize separators to forward slash for consistency
      return relativePath.split(sep).join("/");
    } catch {
      return match;
    }
  });
}

/**
 * Truncate source code blocks to max lines
 */
export function truncateSourceBlocks(
  content: string,
  maxLines: number
): string {
  // Match code blocks with language specifier
  const codeBlockPattern = /```(\w+)?\n([\s\S]*?)```/g;
  
  return content.replace(codeBlockPattern, (match, lang, code) => {
    const lines = code.split("\n");
    if (lines.length <= maxLines) {
      return match;
    }
    
    const truncated = lines.slice(0, maxLines).join("\n");
    const remaining = lines.length - maxLines;
    return `\`\`\`${lang || ""}\n${truncated}\n// ... [${remaining} more lines truncated]\n\`\`\``;
  });
}

/**
 * Truncate content to max characters, preserving structure
 */
export function truncateContent(content: string, maxChars: number): string {
  if (content.length <= maxChars) {
    return content;
  }
  
  const note =
    "\n\n---\n\n> **Note:** Report truncated to stay within size limits. " +
    "Use `--format=summary` or reduce `--max-hotspots` for smaller output.\n";
  const budget = Math.max(maxChars - note.length, 0);

  // Try to truncate at a section boundary
  const sections = content.split(/\n(?=##?\s)/);
  let result = "";
  
  for (const section of sections) {
    if (result.length + section.length > budget) {
      break;
    }
    result += section + "\n";
  }
  
  // If we couldn't get any sections, just hard truncate
  if (!result) {
    result = content.slice(0, budget);
  }
  
  result += note;
  
  return result;
}

/**
 * Stabilize anchors for consistent cross-referencing
 */
export function stabilizeAnchors(content: string): string {
  // Convert function names to stable slugs for anchor links
  const anchorPattern = /<a\s+id="([^"]+)">/g;
  
  return content.replace(anchorPattern, (match, id) => {
    const stableId = generateSlug(id);
    return match.replace(id, stableId);
  });
}

/**
 * Generate a URL-safe slug from a string
 */
export function generateSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[<>]/g, "") // Remove angle brackets
    .replace(/\s+/g, "-") // Spaces to hyphens
    .replace(/[^a-z0-9\-_]/g, "") // Remove special chars
    .replace(/-+/g, "-") // Collapse multiple hyphens
    .replace(/^-|-$/g, ""); // Trim hyphens
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Strip ANSI escape codes
 */
export function stripAnsi(content: string): string {
  // eslint-disable-next-line no-control-regex
  return content.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "");
}

/**
 * Clean up markdown for LLM consumption
 */
export function cleanForLLM(markdown: string): string {
  let result = markdown;
  
  // Remove excessive blank lines
  result = result.replace(/\n{3,}/g, "\n\n");
  
  // Strip ANSI codes
  result = stripAnsi(result);
  
  // Normalize whitespace in tables
  result = result.replace(/\|\s+/g, "| ").replace(/\s+\|/g, " |");
  
  return result.trim();
}
