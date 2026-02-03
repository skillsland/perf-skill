/**
 * File system utilities for temporary file management
 */

import { writeFile, rm, readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { isGzip } from "./limits.js";

/**
 * Generate a unique temporary file path
 */
export function getTempPath(prefix: string = "pprof", ext: string = ".pb.gz"): string {
  return join(tmpdir(), `${prefix}-${randomUUID()}${ext}`);
}

/**
 * Write data to a temporary file and return the path
 */
export async function writeToTemp(
  data: Uint8Array | Buffer,
  prefix: string = "pprof",
  ext: string = ".pb.gz"
): Promise<string> {
  const tempPath = getTempPath(prefix, ext);
  await writeFile(tempPath, data);
  return tempPath;
}

/**
 * Safely remove a file (ignores errors)
 */
export async function safeRemove(path: string): Promise<void> {
  try {
    await rm(path, { force: true });
  } catch {
    // Ignore removal errors
  }
}

/**
 * Execute a function with a temporary file, ensuring cleanup
 */
export async function withTempFile<T>(
  data: Uint8Array | Buffer,
  fn: (path: string) => Promise<T>,
  prefix: string = "pprof",
  ext: string = ".pb.gz"
): Promise<T> {
  const tempPath = await writeToTemp(data, prefix, ext);
  try {
    return await fn(tempPath);
  } finally {
    await safeRemove(tempPath);
  }
}

/**
 * Read and decompress a gzipped file
 */
export async function readGzipFile(
  path: string,
  maxOutputBytes?: number
): Promise<Buffer> {
  const data = await readFile(path);
  return decompressIfNeeded(data, maxOutputBytes);
}

/**
 * Decompress data if gzipped
 */
export function decompressIfNeeded(
  data: Uint8Array | Buffer,
  maxOutputBytes?: number
): Buffer {
  if (isGzip(data)) {
    if (maxOutputBytes) {
      return gunzipSync(data, { maxOutputLength: maxOutputBytes });
    }
    return gunzipSync(data);
  }
  return Buffer.from(data);
}

/**
 * Compress data with gzip
 */
export function compressGzip(data: Uint8Array | Buffer): Buffer {
  return gzipSync(data);
}

/**
 * Pick a profile file extension based on compression
 */
export function getProfileExtension(data: Uint8Array | Buffer): ".pb.gz" | ".pb" {
  return isGzip(data) ? ".pb.gz" : ".pb";
}

/**
 * Ensure directory exists
 */
export async function ensureDir(path: string): Promise<void> {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true });
}

/**
 * Convert base64 to Buffer
 */
export function base64ToBuffer(base64: string): Buffer {
  return Buffer.from(base64, "base64");
}

/**
 * Convert Buffer to base64
 */
export function bufferToBase64(buffer: Buffer | Uint8Array): string {
  return Buffer.from(buffer).toString("base64");
}

/**
 * Load profile from path or base64
 */
export async function loadProfile(
  input: string,
  encoding: "base64" | "path" = "path"
): Promise<Buffer> {
  if (encoding === "base64") {
    return base64ToBuffer(input);
  }
  return readFile(input);
}
