# perf-skill

![Node CI](https://github.com/skillsland/perf-skill/workflows/Node%20CI/badge.svg)
[![npm version](https://badge.fury.io/js/perf-skill.svg)](http://badge.fury.io/js/perf-skill)
![license](https://img.shields.io/npm/l/perf-skill)

**Deterministic** pprof evidence extractor for CPU/heap profiles: convert .pb.gz/.pprof to structured Markdown and JSON, compare profiles for regressions, and produce evidence that any AI agent can use for optimization recommendations.

## Philosophy

This tool follows the "evidence generator" pattern:

1. **Deterministic by default** — All operations produce consistent, reproducible output without external API calls
2. **LLM-agnostic** — The tool produces structured evidence (hotspots, call paths, metrics); the host agent (Claude, Cursor, etc.) performs reasoning
3. **No network by default** — No data leaves your machine unless you explicitly enable AI analysis with `--ai`
4. **Skill-ready** — Designed to work as a Claude Skill / Cursor Agent Skill that provides facts for the agent to interpret

## Features

- **Convert** (default): Transform pprof profiles to structured Markdown and JSON evidence
- **Analyze**: Optionally get AI-powered recommendations with `--ai` flag
- **Diff**: Compare two profiles to find regressions and improvements
- **Multiple interfaces**: Library API and CLI for direct integration

## Installation

```bash
npm install perf-skill
```

Or run directly with npx:

```bash
npx perf-skill analyze profile.pb.gz
```

### Claude Code Plugin (Recommended)

Install as a Claude Code plugin via the marketplace:

```text
# 1. Add the marketplace
/plugin marketplace add skillsland/perf-skill

# 2. Install the plugin
/plugin install perf-skill@skillsland-perf
```

Once installed, Claude Code automatically discovers the skill — no additional setup needed.

### AI Platform Integration (CLI)

Alternatively, install perf-skill as a project-level skill for your preferred AI coding assistant:

```bash
# Claude Code (project-level)
npx perf-skill init --ai claude

# Cursor
npx perf-skill init --ai cursor

# GitHub Copilot
npx perf-skill init --ai copilot

# All supported platforms at once
npx perf-skill init --ai all
```

See [Supported Platforms](#supported-platforms) for the full list.

## Quick Start

### CLI Usage

```bash
# Analyze profile → structured evidence (default, no LLM, no network)
perf-skill analyze cpu.pb.gz -o report.md

# Analyze with explicit AI recommendations (requires API key)
perf-skill analyze cpu.pb.gz --ai -o report.md

# Convert-only command (always deterministic)
perf-skill convert cpu.pb.gz -o report.md

# Profile a Node entry (CPU, 10s) → evidence output
perf-skill run slow.mjs --duration 10s

# Profile with AI recommendations
perf-skill run slow.mjs --duration 10s --ai

# CPU + Heap profiling (separate reports)
perf-skill run slow.mjs --heap --output cpu.md --heap-output heap.md

# Compare two profiles
perf-skill diff base.pb.gz current.pb.gz -o diff.md

# Install skill for your AI platform
perf-skill init --ai claude
perf-skill init --ai cursor --scope project
perf-skill init --ai all  # Install to all supported platforms

# Install SKILL.md to a custom directory
perf-skill init ./skills/perf-skill
```

### Programmatic Usage

```typescript
import { analyze, diff } from "perf-skill";

// Default: deterministic evidence extraction (no LLM, no network)
const result = await analyze("cpu.pb.gz");
console.log(result.markdown);    // Structured Markdown report
console.log(result.hotspots);    // Array of hotspot objects
console.log(result.raw.llmStatus); // "skipped" - no LLM was invoked

// Explicit AI analysis (requires API key)
const fullResult = await analyze("cpu.pb.gz", {
  mode: "analyze",
  context: {
    serviceName: "api-server",
    scenario: "load test",
    targetSLO: "p99 < 100ms",
  },
});
console.log(fullResult.recommendations);
console.log(fullResult.raw.llmStatus); // "success" or "failed"

// Compare two profiles (always deterministic)
const diffResult = await diff("base.pb.gz", "current.pb.gz", {
  normalize: "scale-to-base-total",
});
console.log(diffResult.regressions);
console.log(diffResult.improvements);
```

## CLI Options

### `perf-skill analyze <profile.pb.gz>`

| Option                 | Description                                      | Default        |
| ---------------------- | ------------------------------------------------ | -------------- |
| `-f, --format`         | Output format: `summary`, `detailed`, `adaptive` | `adaptive`     |
| `-t, --type`           | Profile type: `cpu`, `heap`, `auto`              | `auto`         |
| `-o, --output`         | Output markdown file                             | stdout         |
| `-j, --json`           | Output JSON results file                         | -              |
| `-m, --mode`           | `convert-only` or `analyze`                      | `convert-only` |
| `--ai`                 | Enable AI-powered recommendations (requires key) | `false`        |
| `-s, --source-dir`     | Source directory for code context                | -              |
| `--max-hotspots`       | Maximum hotspots to show                         | `10`           |
| `--llm-provider`       | LLM provider: `openai`, `anthropic`, etc.        | `openai`       |
| `--llm-model`          | LLM model name                                   | `gpt-5.2`      |
| `--service`            | Service name for context                         | -              |
| `--scenario`           | Scenario description                             | -              |
| `--redact/--no-redact` | Redact sensitive information                     | `true`         |

> **Note:** By default, `analyze` produces deterministic evidence output (no LLM). Use `--ai` to explicitly enable AI recommendations.

### `perf-skill run <entry> [entryArgs...]`

| Option                  | Description                                      | Default                     |
| ----------------------- | ------------------------------------------------ | --------------------------- |
| `-d, --duration`        | CPU profile duration (e.g. `10s`, `5000ms`)      | `10s`                       |
| `--profile-out`         | Profile output file                              | `cpu.pb.gz`                 |
| `--heap`                | Also capture a heap profile                      | `false`                     |
| `--heap-profile-out`    | Heap profile output file                         | `heap.pb.gz`                |
| `--heap-interval-bytes` | Heap sampling interval (bytes)                   | `524288`                    |
| `--heap-stack-depth`    | Heap sampling stack depth                        | `64`                        |
| `--heap-output`         | Heap markdown output file                        | `heap.md` (if heap enabled) |
| `--heap-json`           | Heap JSON output file                            | -                           |
| `-f, --format`          | Output format: `summary`, `detailed`, `adaptive` | `adaptive`                  |
| `-t, --type`            | Profile type: `cpu`, `heap`, `auto`              | `auto`                      |
| `-o, --output`          | Output markdown file                             | stdout                      |
| `-j, --json`            | Output JSON results file                         | -                           |
| `-m, --mode`            | `convert-only` or `analyze`                      | `convert-only`              |
| `--ai`                  | Enable AI-powered recommendations (requires key) | `false`                     |
| `-s, --source-dir`      | Source directory for code context                | -                           |
| `--max-hotspots`        | Maximum hotspots to show                         | `10`                        |
| `--llm-provider`        | LLM provider: `openai`, `anthropic`, etc.        | `openai`                    |
| `--llm-model`           | LLM model name                                   | `gpt-5.2`                   |
| `--service`             | Service name for context                         | -                           |
| `--scenario`            | Scenario description                             | -                           |
| `--redact/--no-redact`  | Redact sensitive information                     | `true`                      |

When `--heap` is enabled and `--output` is omitted, `perf-skill` writes `cpu.md` and `heap.md` instead of printing to stdout.

> **Note:** By default, `run` produces deterministic evidence output (no LLM). Use `--ai` to explicitly enable AI recommendations.

### `perf-skill profile <entry> [entryArgs...]`

| Option                  | Description                                 | Default      |
| ----------------------- | ------------------------------------------- | ------------ |
| `-d, --duration`        | CPU profile duration (e.g. `10s`, `5000ms`) | `10s`        |
| `-o, --output`          | Profile output file                         | `cpu.pb.gz`  |
| `--heap`                | Also capture a heap profile                 | `false`      |
| `--heap-profile-out`    | Heap profile output file                    | `heap.pb.gz` |
| `--heap-interval-bytes` | Heap sampling interval (bytes)              | `524288`     |
| `--heap-stack-depth`    | Heap sampling stack depth                   | `64`         |

### `perf-skill diff <base.pb.gz> <current.pb.gz>`

| Option                     | Description                                      | Default               |
| -------------------------- | ------------------------------------------------ | --------------------- |
| `-f, --format`             | `diff-summary`, `diff-detailed`, `diff-adaptive` | `diff-adaptive`       |
| `-n, --normalize`          | `none`, `scale-to-base-total`, `per-second`      | `scale-to-base-total` |
| `--max-regressions`        | Maximum regressions to show                      | `10`                  |
| `--max-improvements`       | Maximum improvements to show                     | `5`                   |
| `--max-decompressed-bytes` | Maximum decompressed profile size (bytes)        | -                     |

### `perf-skill init [target]`

Install the `SKILL.md` to a target directory or AI platform.

| Option         | Description                            | Default   |
| -------------- | -------------------------------------- | --------- |
| `-a, --ai`     | Target AI platform (see below)         | -         |
| `-c, --cursor` | Install into Cursor (legacy)           | `false`   |
| `--scope`      | Installation scope: `user` or `project`| `project` |
| `-f, --force`  | Overwrite existing `SKILL.md`          | `false`   |
| `--dry-run`    | Show destination without writing files | `false`   |
| `--offline`    | Use bundled assets only                | `false`   |

#### Supported Platforms

| Platform    | Command                         | Install Location                        |
| ----------- | ------------------------------- | --------------------------------------- |
| Claude      | `--ai claude`                   | `.claude/skills/perf-skill/SKILL.md`    |
| Cursor      | `--ai cursor`                   | `.cursor/skills/perf-skill/SKILL.md`    |
| Windsurf    | `--ai windsurf`                 | `.windsurf/skills/perf-skill/SKILL.md`  |
| Copilot     | `--ai copilot`                  | `.github/copilot/perf-skill.md`         |
| Kiro        | `--ai kiro`                     | `.kiro/skills/perf-skill/SKILL.md`      |
| Codex       | `--ai codex`                    | `.codex/skills/perf-skill/SKILL.md`     |
| Qoder       | `--ai qoder`                    | `.qodo/skills/perf-skill/SKILL.md`      |
| Roo Code    | `--ai roocode`                  | `.roo/skills/perf-skill/SKILL.md`       |
| Gemini      | `--ai gemini`                   | `.gemini/skills/perf-skill/SKILL.md`    |
| Trae        | `--ai trae`                     | `.trae/skills/perf-skill/SKILL.md`      |
| OpenCode    | `--ai opencode`                 | `.opencode/skills/perf-skill/SKILL.md`  |
| Continue    | `--ai continue`                 | `.continue/skills/perf-skill/SKILL.md`  |
| CodeBuddy   | `--ai codebuddy`                | `.codebuddy/skills/perf-skill/SKILL.md` |
| **All**     | `--ai all`                      | Installs to all platforms               |

```bash
# Install for Claude
npx perf-skill init --ai claude

# Install for Cursor (project scope)
npx perf-skill init --ai cursor --scope project

# Install for all supported platforms
npx perf-skill init --ai all

# Preview installation without writing
npx perf-skill init --ai cursor --dry-run
```

## Output Formats

### Summary

Compact format for quick triage:

```markdown
# PPROF Analysis: CPU

**Duration:** 30s | **Samples:** 45,231

## Top Hotspots

| Rank | Function         | Self% | Cum%  | Location         |
| ---- | ---------------- | ----- | ----- | ---------------- |
| 1    | `JSON.parse`     | 23.4% | 23.4% | `<native>`       |
| 2    | `processRequest` | 15.2% | 67.8% | `handler.ts:142` |
```

### Detailed

Full context with call trees and source code.

### Adaptive (Default)

Summary with drill-down sections and anchor links for navigation.

## AI Recommendations (Optional)

When using `--ai` (or `--mode analyze`), the tool invokes an LLM to generate structured recommendations:

```typescript
interface Recommendation {
  title: string; // Short action title
  rationale: string; // Evidence-based explanation
  steps: string[]; // Concrete action steps
  expectedImpact: "high" | "medium" | "low";
  risk: "high" | "medium" | "low";
  confidence: number; // 0-1 based on evidence quality
}
```

All recommendations must reference evidence from the profile (function names, percentages, locations).

> **Note:** For Skill/Agent usage, it is recommended to let the host agent (Claude, Cursor, etc.) generate recommendations based on the deterministic evidence output. This keeps the tool LLM-agnostic and allows the agent to apply its own reasoning.

## Profile Diff

Compare two profiles to identify performance regressions:

```typescript
const result = await diff("base.pb.gz", "current.pb.gz");

// Top regressions (got slower)
for (const reg of result.regressions) {
  console.log(`${reg.function}: +${reg.deltaSelfPct.toFixed(1)}%`);
}

// Top improvements (got faster)
for (const imp of result.improvements) {
  console.log(`${imp.function}: ${imp.deltaSelfPct.toFixed(1)}%`);
}
```

### Normalization Modes

- **none**: Direct comparison (current - base)
- **scale-to-base-total**: Scale current to match base total (compare structure)
- **per-second**: Normalize by duration (compare rate)

## Collecting Profiles

### Node.js with @datadog/pprof

```typescript
import * as pprof from "@datadog/pprof";
import { writeFileSync } from "fs";
import { gzipSync } from "zlib";

// CPU profiling
pprof.time.start({ durationMillis: 30000 });
// ... run workload ...
const profile = await pprof.time.stop();
writeFileSync("cpu.pb.gz", gzipSync(profile.encode()));

// Heap profiling
pprof.heap.start(512 * 1024, 64);
// ... run workload ...
const heapProfile = await pprof.heap.profile();
writeFileSync("heap.pb.gz", gzipSync(heapProfile.encode()));
```

## Configuration

### Environment Variables

| Variable               | Description                                     |
| ---------------------- | ----------------------------------------------- |
| `OPENAI_API_KEY`       | OpenAI API key for analysis                     |
| `ANTHROPIC_API_KEY`    | Anthropic API key                               |
| `LLM_PROVIDER`         | Default LLM provider                            |
| `LLM_MODEL`            | Default LLM model                               |
| `LLM_BASE_URL`         | Custom LLM API endpoint                         |
| `LLM_TIMEOUT_MS`       | LLM request timeout in ms                       |
| `LLM_MAX_RETRIES`      | LLM retry count for transient failures          |
| `LLM_RETRY_DELAY_MS`   | Base retry delay in ms                          |
| `LOG_LEVEL`            | Logging level: `debug`, `info`, `warn`, `error` |
| `LOG_FORMAT`           | Log format: `text`, `json`                      |

Example:

```bash
export LLM_TIMEOUT_MS=30000
export LLM_MAX_RETRIES=2
export LLM_RETRY_DELAY_MS=500
```

### Resource Limits

```typescript
const result = await analyze("large-profile.pb.gz", {
  limits: {
    maxProfileBytes: 100 * 1024 * 1024, // 100MB
    maxDecompressedBytes: 200 * 1024 * 1024, // 200MB uncompressed
    maxMarkdownChars: 500_000, // 500k chars
    maxSourceLinesPerFile: 100, // lines per snippet
    timeoutMs: 120_000, // 2 minutes
  },
});
```

## Security

### Redaction

By default, the tool redacts:

- AWS access keys
- Bearer tokens
- Private keys
- API keys and secrets
- Absolute paths (normalized to relative)

Disable with `--no-redact` or `redact: false`.

## Requirements

- Node.js >= 22.6.0
- CPU profiling uses bundled `@datadog/pprof` (native module) on supported platforms
- **Optional:** For AI recommendations (`--ai`), an API key for OpenAI, Anthropic, or compatible provider

> **No API key required for default usage.** The tool produces complete, actionable evidence without any external dependencies.

## API Reference

### `analyze(profile, options): Promise<AnalyzeResult>`

Analyze a single profile.

### `diff(baseProfile, currentProfile, options): Promise<DiffResult>`

Compare two profiles.

### `convertProfileToMarkdown(buffer, options): Promise<ConvertResult>`

Low-level conversion function.

### `createLLMClient(config): LLMClient`

Create an LLM client for custom integrations.

## Updating Prompt Fixtures

If you change prompt templates and need to refresh fixtures:

```bash
npm run update-prompts
```

## License

MIT
