/**
 * Resource limits and validation
 */

import type { ResourceLimits } from "../types.js";

// Default limits
export const DEFAULT_LIMITS: Required<ResourceLimits> = {
  maxProfileBytes: 50 * 1024 * 1024, // 50MB compressed
  maxDecompressedBytes: 200 * 1024 * 1024, // 200MB uncompressed
  maxMarkdownChars: 200_000, // 200k chars
  maxSourceLinesPerFile: 50, // lines per source snippet
  timeoutMs: 60_000, // 60 seconds
};

/**
 * Merge user limits with defaults
 */
export function resolveLimits(userLimits?: ResourceLimits): Required<ResourceLimits> {
  return {
    ...DEFAULT_LIMITS,
    ...userLimits,
  };
}

/**
 * Check if a buffer exceeds size limit
 */
export function checkSizeLimit(
  data: Uint8Array | Buffer,
  maxBytes: number,
  label: string = "file"
): void {
  if (data.length > maxBytes) {
    throw new Error(
      `${label} size (${formatBytes(data.length)}) exceeds limit (${formatBytes(maxBytes)})`
    );
  }
}

/**
 * Check if content exceeds character limit
 */
export function checkCharLimit(
  content: string,
  maxChars: number,
  label: string = "content"
): void {
  if (content.length > maxChars) {
    throw new Error(
      `${label} length (${content.length} chars) exceeds limit (${maxChars} chars)`
    );
  }
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Format duration in milliseconds
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

/**
 * Create a timeout promise
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string = "Operation timed out"
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`${message} after ${formatDuration(ms)}`)), ms);
    }),
  ]);
}

/**
 * Gzip magic number check
 */
export function isGzip(data: Uint8Array | Buffer): boolean {
  return data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b;
}

/**
 * Validate profile file extension
 */
export function validateProfileExtension(filename: string): void {
  const validExtensions = [".pb.gz", ".pprof", ".pb"];
  const hasValidExt = validExtensions.some((ext) => 
    filename.toLowerCase().endsWith(ext)
  );
  if (!hasValidExt) {
    throw new Error(
      `Invalid profile file extension. Expected: ${validExtensions.join(", ")}`
    );
  }
}
