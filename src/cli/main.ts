#!/usr/bin/env node
/**
 * perf-skill CLI - Analyze pprof profiles with AI assistance
 */

import { Command } from "commander";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { analyze, diff, type DiffOptions } from "../index.js";
import { setLogLevel } from "../utils/logger.js";
import { validateProfileExtension } from "../utils/limits.js";
import {
  buildAnalyzeOptions,
  buildConvertOptions,
  buildDiffOptions,
  type AnalyzeCommandOptions,
  type ConvertCommandOptions,
  type DiffCommandOptions,
} from "./options.js";

const program = new Command();

program
  .name("perf-skill")
  .description("Analyze pprof profiles with AI-powered recommendations")
  .version("1.0.0");

// Analyze command (default)
program
  .command("analyze", { isDefault: true })
  .description("Analyze a single pprof profile")
  .argument("<profile>", "Path to pprof profile (.pb.gz)")
  .option("-f, --format <format>", "Output format: summary, detailed, adaptive", "adaptive")
  .option("-t, --type <type>", "Profile type: cpu, heap, auto", "auto")
  .option("-o, --output <file>", "Output markdown file")
  .option("-j, --json <file>", "Output JSON results file")
  .option("-s, --source-dir <path>", "Source directory for code context")
  .option("--no-source", "Disable source code inclusion")
  .option("--max-hotspots <n>", "Maximum hotspots to show", "10")
  .option("-m, --mode <mode>", "Mode: convert-only, analyze", "analyze")
  .option("--llm-provider <provider>", "LLM provider: openai, azure-openai, anthropic, custom")
  .option("--llm-model <model>", "LLM model name")
  .option("--service <name>", "Service name for context")
  .option("--scenario <desc>", "Scenario description")
  .option("--slo <target>", "Target SLO")
  .option("--no-redact", "Disable redaction of sensitive information")
  .option("-v, --verbose", "Enable verbose logging")
  .action(async (profilePath, opts) => {
    if (opts.verbose) {
      setLogLevel("debug");
    }

    try {
      const resolvedPath = resolve(profilePath);
      validateProfileExtension(resolvedPath);

      const options = buildAnalyzeOptions(opts as AnalyzeCommandOptions);

      // Configure LLM if provided
      if (opts.llmProvider || opts.llmModel) {
        options.llm = {
          provider: opts.llmProvider || "openai",
          model: opts.llmModel || "gpt-4o",
        };
      }

      console.log(`Analyzing ${profilePath}...`);
      const result = await analyze(resolvedPath, options);

      // Output markdown
      if (opts.output) {
        await writeFile(opts.output, result.markdown, "utf-8");
        console.log(`Markdown saved to ${opts.output}`);
      } else {
        console.log("\n" + result.markdown);
      }

      // Output JSON
      if (opts.json) {
        const jsonResult = {
          profileMeta: result.profileMeta,
          hotspots: result.hotspots,
          recommendations: result.recommendations,
          nextSteps: result.nextSteps,
          metrics: result.metrics,
        };
        await writeFile(opts.json, JSON.stringify(jsonResult, null, 2), "utf-8");
        console.log(`JSON saved to ${opts.json}`);
      }

      // Print summary to stderr if outputting to file
      if (opts.output) {
        console.log(`\nFound ${result.hotspots.length} hotspots`);
        if (result.recommendations) {
          console.log(`Generated ${result.recommendations.length} recommendations`);
        }
        if (result.metrics) {
          console.log(`Processing time: ${result.metrics.totalMs.toFixed(0)}ms`);
        }
      }
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Diff command
program
  .command("diff")
  .description("Compare two pprof profiles")
  .argument("<base>", "Path to base profile (.pb.gz)")
  .argument("<current>", "Path to current profile (.pb.gz)")
  .option("-f, --format <format>", "Output format: diff-summary, diff-detailed, diff-adaptive", "diff-adaptive")
  .option("-o, --output <file>", "Output markdown file")
  .option("-j, --json <file>", "Output JSON results file")
  .option("-n, --normalize <mode>", "Normalize mode: none, scale-to-base-total, per-second", "scale-to-base-total")
  .option("--max-regressions <n>", "Maximum regressions to show", "10")
  .option("--max-improvements <n>", "Maximum improvements to show", "5")
  .option("--max-decompressed-bytes <n>", "Maximum decompressed profile size in bytes")
  .option("-m, --mode <mode>", "Mode: convert-only, analyze", "convert-only")
  .option("--llm-provider <provider>", "LLM provider for analysis")
  .option("--llm-model <model>", "LLM model name")
  .option("--service <name>", "Service name for context")
  .option("--changes <desc>", "Recent changes description")
  .option("-v, --verbose", "Enable verbose logging")
  .action(async (basePath, currentPath, opts) => {
    if (opts.verbose) {
      setLogLevel("debug");
    }

    try {
      const resolvedBase = resolve(basePath);
      const resolvedCurrent = resolve(currentPath);
      validateProfileExtension(resolvedBase);
      validateProfileExtension(resolvedCurrent);

      const options: DiffOptions & { mode?: "convert-only" | "analyze" } =
        buildDiffOptions(opts as DiffCommandOptions);

      console.log(`Comparing ${basePath} vs ${currentPath}...`);
      const result = await diff(resolvedBase, resolvedCurrent, options);

      // Output markdown
      if (opts.output) {
        await writeFile(opts.output, result.markdown, "utf-8");
        console.log(`Markdown saved to ${opts.output}`);
      } else {
        console.log("\n" + result.markdown);
      }

      // Output JSON
      if (opts.json) {
        const jsonResult = {
          baseMeta: result.baseMeta,
          currentMeta: result.currentMeta,
          regressions: result.regressions,
          improvements: result.improvements,
          summary: result.summary,
          recommendations: result.recommendations,
          metrics: result.metrics,
        };
        await writeFile(opts.json, JSON.stringify(jsonResult, null, 2), "utf-8");
        console.log(`JSON saved to ${opts.json}`);
      }

      // Print summary to stderr if outputting to file
      if (opts.output) {
        console.log(`\nFound ${result.regressions.length} regressions, ${result.improvements.length} improvements`);
      }
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Convert command (no LLM)
program
  .command("convert")
  .description("Convert pprof profile to markdown (no AI analysis)")
  .argument("<profile>", "Path to pprof profile (.pb.gz)")
  .option("-f, --format <format>", "Output format: summary, detailed, adaptive", "adaptive")
  .option("-t, --type <type>", "Profile type: cpu, heap, auto", "auto")
  .option("-o, --output <file>", "Output markdown file")
  .option("-s, --source-dir <path>", "Source directory for code context")
  .option("--no-source", "Disable source code inclusion")
  .option("--max-hotspots <n>", "Maximum hotspots to show", "10")
  .option("--no-redact", "Disable redaction of sensitive information")
  .option("-v, --verbose", "Enable verbose logging")
  .action(async (profilePath, opts) => {
    if (opts.verbose) {
      setLogLevel("debug");
    }

    try {
      const resolvedPath = resolve(profilePath);
      validateProfileExtension(resolvedPath);

      const options = buildConvertOptions(opts as ConvertCommandOptions);

      console.log(`Converting ${profilePath}...`);
      const result = await analyze(resolvedPath, options);

      if (opts.output) {
        await writeFile(opts.output, result.markdown, "utf-8");
        console.log(`Markdown saved to ${opts.output}`);
      } else {
        console.log("\n" + result.markdown);
      }
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Server command
program
  .command("server")
  .description("Start HTTP API server")
  .option("-p, --port <port>", "Port to listen on", "3000")
  .option("-h, --host <host>", "Host to bind to", "0.0.0.0")
  .option("-v, --verbose", "Enable verbose logging")
  .action(async (opts) => {
    if (opts.verbose) {
      setLogLevel("debug");
    }

    try {
      const { startServer } = await import("../server/http.js");
      await startServer({
        port: parseInt(opts.port, 10),
        host: opts.host,
      });
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();
