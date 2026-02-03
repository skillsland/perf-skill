/**
 * Server utilities for multipart handling
 */

import { rm } from "node:fs/promises";
import { logger } from "../utils/logger.js";
import type { MultipartFile } from "@fastify/multipart";

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
    if (input && "value" in input) {
      return parseOptionsField<T>((input as { value: unknown }).value);
    }
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

export async function resolveMultipartFile(
  request: { file: () => Promise<MultipartFile | undefined>; body?: Record<string, unknown> },
  fieldName: string
): Promise<MultipartFile | undefined> {
  const body = request.body;
  const entry = body?.[fieldName];

  if (Array.isArray(entry)) {
    return entry[0] as MultipartFile;
  }

  if (entry && typeof entry === "object" && (entry as { type?: string }).type === "file") {
    return entry as MultipartFile;
  }

  return request.file();
}

export function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
}

export function parseNumber(value: string | undefined, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}
