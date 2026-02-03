/**
 * Core converter module - wraps pprof-to-md library
 */

import { convert as pprofToMd } from "pprof-to-md";
import type { ConvertOptions, ProfileMeta } from "../types.js";
import { getProfileExtension, withTempFile } from "../utils/fs.js";
import { logger } from "../utils/logger.js";
import { checkSizeLimit, resolveLimits } from "../utils/limits.js";
import { sanitizeMarkdown, type SanitizeOptions } from "./sanitize.js";
import { extractHotspots, extractProfileMeta } from "./extract.js";
import type { Hotspot } from "../types.js";

export interface ConvertResult {
  /** Generated markdown */
  markdown: string;
  /** Original markdown before sanitization */
  rawMarkdown: string;
  /** Extracted hotspots */
  hotspots: Hotspot[];
  /** Profile metadata */
  meta?: ProfileMeta;
  /** Processing time in ms */
  durationMs: number;
}

export interface FullConvertOptions extends ConvertOptions {
  /** Maximum profile size in bytes */
  maxProfileBytes?: number;
  /** Maximum markdown output characters */
  maxMarkdownChars?: number;
  /** Sanitization options */
  sanitize?: SanitizeOptions;
}

/**
 * Convert a pprof profile buffer to markdown
 */
export async function convertProfileToMarkdown(
  profileBytes: Uint8Array | Buffer,
  options: FullConvertOptions = {}
): Promise<ConvertResult> {
  const startTime = performance.now();
  const limits = resolveLimits(options);
  
  // Check input size
  checkSizeLimit(profileBytes, limits.maxProfileBytes, "Profile");
  
  logger.debug("Converting profile to markdown", {
    profileBytes: profileBytes.length,
    format: options.format ?? "adaptive",
    profileType: options.profileType ?? "auto",
  });

  const pprofProfileType = options.profileType === "auto" ? undefined : options.profileType;
  
  const tempExt = getProfileExtension(profileBytes);

  // Convert using pprof-to-md (requires file path)
  const rawMarkdown = await withTempFile(profileBytes, async (tempPath) => {
    // pprof-to-md convert function
    const md = await Promise.resolve(
        pprofToMd(tempPath, {
          format: options.format ?? "adaptive",
          profileType: pprofProfileType,
          maxHotspots: options.maxHotspots ?? 10,
          sourceDir: options.sourceDir,
          includeSource: options.includeSource !== false,
        })
    );
    return md as string;
  }, "pprof", tempExt);
  
  logger.debug("Raw markdown generated", { chars: rawMarkdown.length });
  
  // Check if markdown exceeds limit and needs format downgrade
  let markdown = rawMarkdown;
  let usedFormat = options.format ?? "adaptive";
  
  if (rawMarkdown.length > limits.maxMarkdownChars) {
    logger.info("Markdown exceeds limit, downgrading to summary format", {
      chars: rawMarkdown.length,
      limit: limits.maxMarkdownChars,
    });
    
    // Retry with summary format and fewer hotspots
    markdown = await withTempFile(profileBytes, async (tempPath) => {
      const md = await Promise.resolve(
        pprofToMd(tempPath, {
          format: "summary",
          profileType: pprofProfileType,
          maxHotspots: Math.min(options.maxHotspots ?? 10, 10),
          sourceDir: options.sourceDir,
          includeSource: false, // Disable source for smaller output
        })
      );
      return md as string;
    }, "pprof", tempExt);
    usedFormat = "summary";
  }
  
  // Extract metadata and hotspots from markdown
  const meta = extractProfileMeta(markdown);
  const hotspots = extractHotspots(markdown);
  
  // Sanitize markdown
  const sanitizedMarkdown = sanitizeMarkdown(markdown, {
    ...options.sanitize,
    maxChars: limits.maxMarkdownChars,
    maxSourceLines: limits.maxSourceLinesPerFile,
    baseDir: options.sourceDir,
  });
  
  const durationMs = performance.now() - startTime;
  
  logger.info("Profile conversion complete", {
    durationMs: Math.round(durationMs),
    format: usedFormat,
    hotspotsFound: hotspots.length,
    outputChars: sanitizedMarkdown.length,
  });
  
  return {
    markdown: sanitizedMarkdown,
    rawMarkdown,
    hotspots,
    meta,
    durationMs,
  };
}

/**
 * Convert profile from file path
 */
export async function convertProfileFromPath(
  profilePath: string,
  options: FullConvertOptions = {}
): Promise<ConvertResult> {
  const { readFile } = await import("node:fs/promises");
  const profileBytes = await readFile(profilePath);
  return convertProfileToMarkdown(profileBytes, options);
}

/**
 * Convert profile from base64 string
 */
export async function convertProfileFromBase64(
  base64: string,
  options: FullConvertOptions = {}
): Promise<ConvertResult> {
  const buffer = Buffer.from(base64, "base64");
  return convertProfileToMarkdown(buffer, options);
}
