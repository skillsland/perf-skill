/**
 * HTTP API server for perf-skill
 * 
 * All endpoints produce deterministic, evidence-based output by default.
 * No external LLM calls are made unless explicitly requested.
 */

import Fastify, { type FastifyInstance } from "fastify";
import multipart, { type MultipartFile } from "@fastify/multipart";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { analyze, diff } from "../index.js";
import type { AnalyzeOptions, DiffOptions, AnalyzeResult, DiffResult, ApiResponse } from "../types.js";
import { logger } from "../utils/logger.js";
import { checkSizeLimit, DEFAULT_LIMITS } from "../utils/limits.js";
import {
  cleanupUploadedFiles,
  parseOptionsField,
  parseBoolean,
  parseNumber,
  resolveMultipartFile,
} from "./utils.js";

// Read version from package.json
function getPackageVersion(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const pkgPath = join(__dirname, "..", "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const packageVersion = getPackageVersion();

export interface ServerOptions {
  port?: number;
  host?: string;
  maxFileSize?: number;
  enableCors?: boolean;
  corsOrigin?: string | string[] | boolean;
  enableHelmet?: boolean;
  enableRateLimit?: boolean;
  rateLimitMax?: number;
  rateLimitWindowMs?: number;
  analyzeFn?: typeof analyze;
  diffFn?: typeof diff;
}

/**
 * Create and configure Fastify server
 */
export async function createServer(options: ServerOptions = {}): Promise<FastifyInstance> {
  const server = Fastify({
    logger: process.env.LOG_FORMAT === "json",
  });

  const analyzeFn = options.analyzeFn ?? analyze;
  const diffFn = options.diffFn ?? diff;

  const corsEnabled = options.enableCors ?? parseBoolean(process.env.CORS_ENABLED, true);
  const helmetEnabled = options.enableHelmet ?? parseBoolean(process.env.HELMET_ENABLED, true);
  const rateLimitEnabled = options.enableRateLimit ?? parseBoolean(process.env.RATE_LIMIT_ENABLED, true);

  if (corsEnabled) {
    const originValue = options.corsOrigin ?? process.env.CORS_ORIGIN ?? true;
    const origin = typeof originValue === "string"
      ? originValue === "*"
        ? true
        : originValue.split(",").map((item) => item.trim()).filter(Boolean)
      : originValue;
    await server.register(cors, { origin });
  }

  if (helmetEnabled) {
    await server.register(helmet);
  }

  if (rateLimitEnabled) {
    const max = options.rateLimitMax ?? parseNumber(process.env.RATE_LIMIT_MAX, 60);
    const timeWindow = options.rateLimitWindowMs ?? parseNumber(process.env.RATE_LIMIT_WINDOW_MS, 60_000);
    if (max > 0) {
      await server.register(rateLimit, { max, timeWindow });
    }
  }

  // Register multipart plugin for file uploads
  await server.register(multipart, {
    attachFieldsToBody: true,
    limits: {
      fileSize: options.maxFileSize ?? DEFAULT_LIMITS.maxProfileBytes,
    },
  });

  // Health check
  server.get("/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  // API info
  server.get("/v1", async () => {
    return {
      name: "perf-skill",
      version: packageVersion,
      description: "Deterministic performance profile evidence extractor",
      endpoints: {
        analyze: {
          path: "POST /v1/pprof/analyze",
          description: "Convert profile to structured evidence (convert-only by default)",
        },
        diff: {
          path: "POST /v1/pprof/diff",
          description: "Compare two profiles and identify regressions/improvements",
        },
        convert: {
          path: "POST /v1/pprof/convert",
          description: "Convert profile to Markdown (always convert-only)",
        },
      },
    };
  });

  // Analyze endpoint
  server.post<{
    Body: { options?: string | AnalyzeOptions };
  }>("/v1/pprof/analyze", async (request, reply) => {
    const startTime = performance.now();

    try {
      // Handle multipart file upload
      const data = await resolveMultipartFile(
        request as { file: () => Promise<MultipartFile | undefined>; body?: Record<string, unknown> },
        "file"
      );
      if (!data) {
        return reply.status(400).send({
          success: false,
          error: {
            code: "MISSING_FILE",
            message: "Profile file is required",
          },
        } satisfies ApiResponse<never>);
      }

      const profileBuffer = await (data as { toBuffer: () => Promise<Buffer> }).toBuffer();
      checkSizeLimit(profileBuffer, DEFAULT_LIMITS.maxProfileBytes, "Profile");

      let options: AnalyzeOptions;
      try {
        options = parseOptionsField<AnalyzeOptions>(request.body?.options);
      } catch (error) {
        return reply.status(400).send({
          success: false,
          error: {
            code: "INVALID_OPTIONS",
            message: error instanceof Error ? error.message : "Invalid options",
          },
        } satisfies ApiResponse<never>);
      }
      
      // Default to convert-only mode (deterministic, no LLM)
      // LLM analysis requires explicit mode: "analyze" in options
      if (options.mode === undefined) {
        options.mode = "convert-only";
      }
      
      // Default to not including source in server mode for security
      if (options.includeSource === undefined) {
        options.includeSource = false;
      }

      logger.info("Analyze request received", {
        filename: data.filename,
        size: profileBuffer.length,
        mode: options.mode,
      });

      const result = await analyzeFn(profileBuffer, options);

      const response: ApiResponse<AnalyzeResult> = {
        success: true,
        data: result,
      };

      logger.info("Analyze request completed", {
        durationMs: Math.round(performance.now() - startTime),
        hotspotsCount: result.hotspots.length,
      });

      return response;
    } catch (error) {
      logger.error("Analyze request failed", {
        error: error instanceof Error ? error.message : String(error),
      });

      return reply.status(500).send({
        success: false,
        error: {
          code: "ANALYSIS_ERROR",
          message: error instanceof Error ? error.message : "Analysis failed",
        },
      } satisfies ApiResponse<never>);
    }
  });

  // Convert-only endpoint (no LLM)
  server.post<{
    Body: { options?: string | AnalyzeOptions };
  }>("/v1/pprof/convert", async (request, reply) => {
    try {
      const data = await resolveMultipartFile(
        request as { file: () => Promise<MultipartFile | undefined>; body?: Record<string, unknown> },
        "file"
      );
      if (!data) {
        return reply.status(400).send({
          success: false,
          error: {
            code: "MISSING_FILE",
            message: "Profile file is required",
          },
        } satisfies ApiResponse<never>);
      }

      const profileBuffer = await (data as { toBuffer: () => Promise<Buffer> }).toBuffer();
      checkSizeLimit(profileBuffer, DEFAULT_LIMITS.maxProfileBytes, "Profile");

      let parsedOptions: AnalyzeOptions;
      try {
        parsedOptions = parseOptionsField<AnalyzeOptions>(request.body?.options);
      } catch (error) {
        return reply.status(400).send({
          success: false,
          error: {
            code: "INVALID_OPTIONS",
            message: error instanceof Error ? error.message : "Invalid options",
          },
        } satisfies ApiResponse<never>);
      }

      const options: AnalyzeOptions = {
        ...parsedOptions,
        mode: "convert-only",
        includeSource: false,
      };

      const result = await analyzeFn(profileBuffer, options);

      return {
        success: true,
        data: result,
      } satisfies ApiResponse<AnalyzeResult>;
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: {
          code: "CONVERT_ERROR",
          message: error instanceof Error ? error.message : "Conversion failed",
        },
      } satisfies ApiResponse<never>);
    }
  });

  // Diff endpoint
  server.post<{
    Body: { options?: string | DiffOptions };
  }>("/v1/pprof/diff", async (request, reply) => {
    const startTime = performance.now();
    let files: Awaited<ReturnType<typeof request.saveRequestFiles>> | undefined;

    try {
      // Expect two files: base and current
      files = await request.saveRequestFiles();
      
      if (files.length < 2) {
        return reply.status(400).send({
          success: false,
          error: {
            code: "MISSING_FILES",
            message: "Two profile files required (base and current)",
          },
        } satisfies ApiResponse<never>);
      }

      const baseFile = files.find(f => f.fieldname === "base") || files[0];
      const currentFile = files.find(f => f.fieldname === "current") || files[1];

      const { readFile } = await import("node:fs/promises");
      const baseBuffer = await readFile(baseFile.filepath);
      const currentBuffer = await readFile(currentFile.filepath);

      checkSizeLimit(baseBuffer, DEFAULT_LIMITS.maxProfileBytes, "Base profile");
      checkSizeLimit(currentBuffer, DEFAULT_LIMITS.maxProfileBytes, "Current profile");

      let options: DiffOptions;
      try {
        options = parseOptionsField<DiffOptions>(request.body?.options);
      } catch (error) {
        return reply.status(400).send({
          success: false,
          error: {
            code: "INVALID_OPTIONS",
            message: error instanceof Error ? error.message : "Invalid options",
          },
        } satisfies ApiResponse<never>);
      }

      logger.info("Diff request received", {
        baseSize: baseBuffer.length,
        currentSize: currentBuffer.length,
      });

      const result = await diffFn(baseBuffer, currentBuffer, options);

      logger.info("Diff request completed", {
        durationMs: Math.round(performance.now() - startTime),
        regressions: result.regressions.length,
        improvements: result.improvements.length,
      });

      return {
        success: true,
        data: result,
      } satisfies ApiResponse<DiffResult>;
    } catch (error) {
      logger.error("Diff request failed", {
        error: error instanceof Error ? error.message : String(error),
      });

      return reply.status(500).send({
        success: false,
        error: {
          code: "DIFF_ERROR",
          message: error instanceof Error ? error.message : "Diff analysis failed",
        },
      } satisfies ApiResponse<never>);
    } finally {
      if (files) {
        await cleanupUploadedFiles(files);
      }
    }
  });

  // Error handler
  server.setErrorHandler((error, request, reply) => {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Server error", {
      error: message,
      url: request.url,
    });

    reply.status(500).send({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal server error",
      },
    } satisfies ApiResponse<never>);
  });

  return server;
}

/**
 * Start the HTTP server
 */
export async function startServer(options: ServerOptions = {}): Promise<FastifyInstance> {
  const server = await createServer(options);

  const port = options.port ?? 3000;
  const host = options.host ?? "0.0.0.0";

  try {
    await server.listen({ port, host });
    console.log(`perf-skill server listening on http://${host}:${port}`);
    console.log(`API docs: http://${host}:${port}/v1`);
    return server;
  } catch (error) {
    logger.error("Failed to start server", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
