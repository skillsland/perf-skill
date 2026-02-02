/**
 * Convert module exports
 */

export {
  convertProfileToMarkdown,
  convertProfileFromPath,
  convertProfileFromBase64,
  type ConvertResult,
  type FullConvertOptions,
} from "./converter.js";

export {
  sanitizeMarkdown,
  redactSecrets,
  normalizePaths,
  truncateSourceBlocks,
  truncateContent,
  cleanForLLM,
  generateSlug,
  type SanitizeOptions,
} from "./sanitize.js";

export {
  extractProfileMeta,
  extractHotspots,
  extractCallPath,
  extractCallers,
  extractCallees,
  enrichHotspots,
} from "./extract.js";
