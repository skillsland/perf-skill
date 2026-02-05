#!/usr/bin/env node
/**
 * perf-skill CLI - Analyze pprof profiles with AI assistance
 */

import { Command } from "commander";
import { writeFile } from "node:fs/promises";
import { join, parse, resolve } from "node:path";
import { analyze, diff, type DiffOptions } from "../index.js";
import { parseDurationInput, runCpuProfile } from "../profile/runner.js";
import { setLogLevel } from "../utils/logger.js";
import { validateProfileExtension } from "../utils/limits.js";
import { runInit, type CursorScope } from "./init.js";
import {
  buildAnalyzeOptions,
  buildConvertOptions,
  buildDiffOptions,
  type AnalyzeCommandOptions,
  type ConvertCommandOptions,
  type DiffCommandOptions,
} from "./options.js";

const program = new Command();

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

// Read version from package.json
function getPackageVersion(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    // Look for package.json in parent directories
    const pkgPath = join(__dirname, "..", "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const packageVersion = getPackageVersion();

program
  .name("perf-skill")
  .description("Convert pprof profiles to structured Markdown and generate evidence for performance analysis")
  .version(packageVersion);

type AnalyzeCliOptions = AnalyzeCommandOptions & {
  output?: string;
  json?: string;
  llmProvider?: string;
  llmModel?: string;
  verbose?: boolean;
  ai?: boolean;
};

function parseOptionalInt(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseCursorScope(scope?: string): CursorScope | undefined {
  if (!scope) return undefined;
  if (scope !== "user" && scope !== "project") {
    throw new Error(`Invalid scope: ${scope}. Use 'user' or 'project'.`);
  }
  return scope;
}

function deriveSiblingPath(basePath: string, suffix: string, defaultExt: string): string {
  const parsed = parse(basePath);
  const ext = parsed.ext || defaultExt;
  const name = parsed.ext ? parsed.name : parsed.base;
  const filename = `${name}.${suffix}${ext}`;
  return parsed.dir ? join(parsed.dir, filename) : filename;
}

async function executeAnalyze(profilePath: string, opts: AnalyzeCliOptions): Promise<void> {
  if (opts.verbose) {
    setLogLevel("debug");
  }

  const resolvedPath = resolve(profilePath);
  validateProfileExtension(resolvedPath);

  const options = buildAnalyzeOptions(opts);

  if (opts.llmProvider || opts.llmModel) {
    options.llm = {
      provider: opts.llmProvider ?? "openai",
      model: opts.llmModel || "gpt-5.2",
    };
  }

  console.log(`Analyzing ${profilePath}...`);
  const result = await analyze(resolvedPath, options);

  if (opts.output) {
    await writeFile(opts.output, result.markdown, "utf-8");
    console.log(`Markdown saved to ${opts.output}`);
  } else {
    console.log("\n" + result.markdown);
  }

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

  if (opts.output) {
    console.log(`\nFound ${result.hotspots.length} hotspots`);
    if (result.recommendations) {
      console.log(`Generated ${result.recommendations.length} recommendations`);
    }
    if (result.metrics) {
      console.log(`Processing time: ${result.metrics.totalMs.toFixed(0)}ms`);
    }
  }
}

// Init command (install SKILL.md)
program
  .command("init")
  .description("Install SKILL.md to a target directory")
  .argument("[target]", "Target directory or file path")
  .option("-c, --cursor", "Install into Cursor skills folder")
  .option("--scope <scope>", "Cursor scope: user or project")
  .option("-f, --force", "Overwrite existing SKILL.md")
  .option("--dry-run", "Show destination without writing files")
  .action(async (target, opts) => {
    try {
      const scope = parseCursorScope(opts.scope);
      const result = await runInit({
        target,
        cursor: opts.cursor,
        scope,
        force: opts.force,
        dryRun: opts.dryRun,
      });

      const prefix = opts.dryRun ? "Would install skill to" : "Installed skill to";
      console.log(`${prefix} ${result.destFile}`);
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Analyze command (default)
program
  .command("analyze", { isDefault: true })
  .description("Analyze a single pprof profile (default: convert to Markdown without LLM)")
  .argument("<profile>", "Path to pprof profile (.pb.gz)")
  .option("-f, --format <format>", "Output format: summary, detailed, adaptive", "adaptive")
  .option("-t, --type <type>", "Profile type: cpu, heap, auto", "auto")
  .option("-o, --output <file>", "Output markdown file")
  .option("-j, --json <file>", "Output JSON results file")
  .option("-s, --source-dir <path>", "Source directory for code context")
  .option("--no-source", "Disable source code inclusion")
  .option("--max-hotspots <n>", "Maximum hotspots to show", "10")
  .option("--ai", "Enable AI-powered recommendations (requires LLM API key)")
  .option("-m, --mode <mode>", "Mode: convert-only, analyze (deprecated, use --ai)", "convert-only")
  .option("--llm-provider <provider>", "LLM provider: openai, azure-openai, anthropic, custom")
  .option("--llm-model <model>", "LLM model name")
  .option("--service <name>", "Service name for context")
  .option("--scenario <desc>", "Scenario description")
  .option("--slo <target>", "Target SLO")
  .option("--no-redact", "Disable redaction of sensitive information")
  .option("-v, --verbose", "Enable verbose logging")
  .action(async (profilePath, opts) => {
    try {
      // --ai flag overrides mode to 'analyze'
      if (opts.ai) {
        opts.mode = "analyze";
      }
      await executeAnalyze(profilePath, opts as AnalyzeCliOptions);
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Run command (profile + analyze)
program
  .command("run")
  .description("Profile a Node entry file and convert the resulting profiles to Markdown")
  .argument("<entry>", "Entry file to run (js/mjs/cjs)")
  .argument("[entryArgs...]", "Arguments passed to the entry file")
  .option("-d, --duration <duration>", "CPU profile duration (e.g. 10s, 5000ms)", "10s")
  .option("--profile-out <file>", "Profile output file", "cpu.pb.gz")
  .option("--heap", "Also capture a heap profile")
  .option("--heap-profile-out <file>", "Heap profile output file", "heap.pb.gz")
  .option("--heap-interval-bytes <n>", "Heap sampling interval in bytes")
  .option("--heap-stack-depth <n>", "Heap sampling stack depth")
  .option("--heap-output <file>", "Heap markdown output file")
  .option("--heap-json <file>", "Heap JSON output file")
  .option("-f, --format <format>", "Output format: summary, detailed, adaptive", "adaptive")
  .option("-t, --type <type>", "Profile type: cpu, heap, auto", "auto")
  .option("-o, --output <file>", "Output markdown file")
  .option("-j, --json <file>", "Output JSON results file")
  .option("-s, --source-dir <path>", "Source directory for code context")
  .option("--no-source", "Disable source code inclusion")
  .option("--max-hotspots <n>", "Maximum hotspots to show", "10")
  .option("--ai", "Enable AI-powered recommendations (requires LLM API key)")
  .option("-m, --mode <mode>", "Mode: convert-only, analyze (deprecated, use --ai)", "convert-only")
  .option("--llm-provider <provider>", "LLM provider: openai, azure-openai, anthropic, custom")
  .option("--llm-model <model>", "LLM model name")
  .option("--service <name>", "Service name for context")
  .option("--scenario <desc>", "Scenario description")
  .option("--slo <target>", "Target SLO")
  .option("--no-redact", "Disable redaction of sensitive information")
  .option("-v, --verbose", "Enable verbose logging")
  .action(async (entryPath, entryArgs, opts) => {
    try {
      if (opts.verbose) {
        setLogLevel("debug");
      }

      // --ai flag overrides mode to 'analyze'
      if (opts.ai) {
        opts.mode = "analyze";
      }

      const durationMs = parseDurationInput(opts.duration);
      const profilePath = resolve(opts.profileOut);
      const heapEnabled = Boolean(opts.heap);
      const heapIntervalBytes = parseOptionalInt(opts.heapIntervalBytes);
      const heapStackDepth = parseOptionalInt(opts.heapStackDepth);
      const cpuOutput = opts.output ?? (heapEnabled ? "cpu.md" : undefined);
      const cpuJson = opts.json;
      const heapOutput = heapEnabled
        ? opts.heapOutput ?? (opts.output ? deriveSiblingPath(opts.output, "heap", ".md") : "heap.md")
        : undefined;
      const heapJson = heapEnabled
        ? opts.heapJson ?? (cpuJson ? deriveSiblingPath(cpuJson, "heap", ".json") : undefined)
        : undefined;

      console.log(`Profiling ${entryPath} for ${opts.duration}...`);
      const { heapProfilePath } = await runCpuProfile({
        entryPath,
        entryArgs,
        durationMs,
        outPath: profilePath,
        enableHeap: heapEnabled,
        heapOutPath: heapEnabled ? resolve(opts.heapProfileOut) : undefined,
        heapIntervalBytes,
        heapStackDepth,
      });

      await executeAnalyze(
        profilePath,
        { ...(opts as AnalyzeCliOptions), output: cpuOutput, json: cpuJson, type: "cpu" }
      );

      if (heapEnabled && heapProfilePath) {
        await executeAnalyze(
          heapProfilePath,
          { ...(opts as AnalyzeCliOptions), output: heapOutput, json: heapJson, type: "heap" }
        );
      }
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Profile-only command
program
  .command("profile")
  .description("Generate a CPU profile for a Node entry file")
  .argument("<entry>", "Entry file to run (js/mjs/cjs)")
  .argument("[entryArgs...]", "Arguments passed to the entry file")
  .option("-d, --duration <duration>", "CPU profile duration (e.g. 10s, 5000ms)", "10s")
  .option("-o, --output <file>", "Profile output file", "cpu.pb.gz")
  .option("--heap", "Also capture a heap profile")
  .option("--heap-profile-out <file>", "Heap profile output file", "heap.pb.gz")
  .option("--heap-interval-bytes <n>", "Heap sampling interval in bytes")
  .option("--heap-stack-depth <n>", "Heap sampling stack depth")
  .option("-v, --verbose", "Enable verbose logging")
  .action(async (entryPath, entryArgs, opts) => {
    if (opts.verbose) {
      setLogLevel("debug");
    }

    try {
      const durationMs = parseDurationInput(opts.duration);
      const profilePath = resolve(opts.output);
      const heapEnabled = Boolean(opts.heap);
      const heapIntervalBytes = parseOptionalInt(opts.heapIntervalBytes);
      const heapStackDepth = parseOptionalInt(opts.heapStackDepth);
      console.log(`Profiling ${entryPath} for ${opts.duration}...`);
      const { heapProfilePath } = await runCpuProfile({
        entryPath,
        entryArgs,
        durationMs,
        outPath: profilePath,
        enableHeap: heapEnabled,
        heapOutPath: heapEnabled ? resolve(opts.heapProfileOut) : undefined,
        heapIntervalBytes,
        heapStackDepth,
      });
      console.log(`Profile saved to ${profilePath}`);
      if (heapEnabled && heapProfilePath) {
        console.log(`Heap profile saved to ${heapProfilePath}`);
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
  .option("--cors", "Enable CORS")
  .option("--no-cors", "Disable CORS")
  .option("--cors-origin <origin>", "CORS origin(s), comma-separated or '*'")
  .option("--helmet", "Enable helmet security headers")
  .option("--no-helmet", "Disable helmet security headers")
  .option("--rate-limit", "Enable rate limiting")
  .option("--no-rate-limit", "Disable rate limiting")
  .option("--rate-limit-max <n>", "Rate limit max requests per window")
  .option("--rate-limit-window-ms <ms>", "Rate limit window in ms")
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
        enableCors: opts.cors,
        corsOrigin: opts.corsOrigin,
        enableHelmet: opts.helmet,
        enableRateLimit: opts.rateLimit,
        rateLimitMax: opts.rateLimitMax ? parseInt(opts.rateLimitMax, 10) : undefined,
        rateLimitWindowMs: opts.rateLimitWindowMs ? parseInt(opts.rateLimitWindowMs, 10) : undefined,
      });
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();
