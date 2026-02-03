/**
 * Server utilities for multipart handling
 */

import { rm } from "node:fs/promises";
import { logger } from "../utils/logger.js";

export function parseOptionsField<T extends object>(input: unknown): T {
  if (input === undefined || input === null) {
    return {} as T;
  }

  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) {
      return {} as T;
    }
    try {
      return JSON.parse(trimmed) as T;
    } catch (error) {
      throw new Error(
        `Invalid options JSON: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  if (typeof input === "object") {
    return input as T;
  }

  throw new Error("Invalid options field type");
}

export async function cleanupUploadedFiles(
  files: Array<{ filepath?: string | null }>
): Promise<void> {
  const paths = files
    .map((file) => file.filepath)
    .filter((path): path is string => Boolean(path));

  const results = await Promise.allSettled(
    paths.map((path) => rm(path, { force: true }))
  );

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      logger.warn("Failed to cleanup uploaded file", {
        path: paths[index],
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  });
}
