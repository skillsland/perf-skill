# perf-skill

AI-powered pprof profile analysis. Convert `.pb.gz` profiles to LLM-friendly Markdown and generate actionable performance recommendations.

## Features

- **Convert**: Transform pprof profiles to structured Markdown
- **Analyze**: Get AI-powered optimization recommendations
- **Diff**: Compare two profiles to find regressions
- **Multi-format**: Library, CLI, and HTTP API

## Installation

```bash
npm install perf-skill
```

Or run directly with npx:

```bash
npx perf-skill analyze profile.pb.gz
```

## Quick Start

### CLI Usage

```bash
# Convert profile to markdown (fast, no LLM)
perf-skill convert cpu.pb.gz -o report.md

# Full analysis with AI recommendations
perf-skill analyze cpu.pb.gz --mode analyze

# Profile a Node entry (CPU, 10s) and analyze
perf-skill run slow.mjs --duration 10s

# CPU + Heap profiling (separate reports)
perf-skill run slow.mjs --heap --output cpu.md --heap-output heap.md

# Compare two profiles
perf-skill diff base.pb.gz current.pb.gz -o diff.md

# Start HTTP server
perf-skill server --port 3000
```

### Programmatic Usage

```typescript
import { analyze, diff } from "perf-skill-skill";

// Convert only (no LLM)
const result = await analyze("cpu.pb.gz", { mode: "convert-only" });
console.log(result.markdown);
console.log(result.hotspots);

// Full analysis with AI recommendations
const fullResult = await analyze("cpu.pb.gz", {
  mode: "analyze",
  context: {
    serviceName: "api-server",
    scenario: "load test",
    targetSLO: "p99 < 100ms",
  },
});
console.log(fullResult.recommendations);

// Compare two profiles
const diffResult = await diff("base.pb.gz", "current.pb.gz", {
  normalize: "scale-to-base-total",
});
console.log(diffResult.regressions);
console.log(diffResult.improvements);
```

### HTTP API

```bash
# Start server
perf-skill server

# Start server with security overrides
perf-skill server --no-cors --no-helmet --rate-limit --rate-limit-max 120 --rate-limit-window-ms 60000

# Analyze profile
curl -X POST http://localhost:3000/v1/pprof/analyze \
  -F "file=@cpu.pb.gz"

# Compare profiles
curl -X POST http://localhost:3000/v1/pprof/diff \
  -F "base=@base.pb.gz" \
  -F "current=@current.pb.gz"
```

## CLI Options

### `perf-skill analyze <profile.pb.gz>`

| Option                 | Description                                      | Default    |
| ---------------------- | ------------------------------------------------ | ---------- |
| `-f, --format`         | Output format: `summary`, `detailed`, `adaptive` | `adaptive` |
| `-t, --type`           | Profile type: `cpu`, `heap`, `auto`              | `auto`     |
| `-o, --output`         | Output markdown file                             | stdout     |
| `-j, --json`           | Output JSON results file                         | -          |
| `-m, --mode`           | `convert-only` or `analyze`                      | `analyze`  |
| `-s, --source-dir`     | Source directory for code context                | -          |
| `--max-hotspots`       | Maximum hotspots to show                         | `10`       |
| `--llm-provider`       | LLM provider: `openai`, `anthropic`, etc.        | `openai`   |
| `--llm-model`          | LLM model name                                   | `gpt-5.2`  |
| `--service`            | Service name for context                         | -          |
| `--scenario`           | Scenario description                             | -          |
| `--redact/--no-redact` | Redact sensitive information                     | `true`     |

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
| `-m, --mode`            | `convert-only` or `analyze`                      | `analyze`                   |
| `-s, --source-dir`      | Source directory for code context                | -                           |
| `--max-hotspots`        | Maximum hotspots to show                         | `10`                        |
| `--llm-provider`        | LLM provider: `openai`, `anthropic`, etc.        | `openai`                    |
| `--llm-model`           | LLM model name                                   | `gpt-5.2`                   |
| `--service`             | Service name for context                         | -                           |
| `--scenario`            | Scenario description                             | -                           |
| `--redact/--no-redact`  | Redact sensitive information                     | `true`                      |

When `--heap` is enabled and `--output` is omitted, `perf-skill` writes `cpu.md` and `heap.md` instead of printing to stdout.

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

## AI Recommendations

When using `--mode analyze`, the tool generates structured recommendations:

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
| `CORS_ENABLED`         | Enable CORS (`true`/`false`)                    |
| `CORS_ORIGIN`          | CORS origin(s), comma-separated or `*`          |
| `HELMET_ENABLED`       | Enable Helmet (`true`/`false`)                  |
| `RATE_LIMIT_ENABLED`   | Enable rate limiting (`true`/`false`)           |
| `RATE_LIMIT_MAX`       | Rate limit max requests per window              |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window size in ms                    |

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

### Server Mode

In HTTP server mode:

- Source code inclusion is disabled by default
- File size limits are enforced
- Only `.pb.gz` files are accepted

Security defaults (configurable via env or server options):

- CORS enabled (set `CORS_ENABLED=false` to disable)
- Helmet enabled (set `HELMET_ENABLED=false` to disable)
- Rate limiting enabled (default 60 req/min, set `RATE_LIMIT_ENABLED=false` or `RATE_LIMIT_MAX=0` to disable)

Server CLI flags (override env defaults):

- `--cors/--no-cors`
- `--cors-origin <origin>` (comma-separated or `*`)
- `--helmet/--no-helmet`
- `--rate-limit/--no-rate-limit`
- `--rate-limit-max <n>`
- `--rate-limit-window-ms <ms>`

ServerOptions (programmatic):

```typescript
const server = await createServer({
  enableCors: true,
  corsOrigin: "https://example.com",
  enableHelmet: true,
  enableRateLimit: true,
  rateLimitMax: 60,
  rateLimitWindowMs: 60_000,
});
```

## Requirements

- Node.js >= 22.6.0
- For AI analysis: API key for OpenAI, Anthropic, or compatible provider
- CPU profiling uses bundled `@datadog/pprof` (native module) on supported platforms

## Architecture

```
perf-skill/
├── src/
│   ├── index.ts          # Main exports
│   ├── types.ts          # TypeScript types
│   ├── convert/          # pprof-to-md wrapper
│   │   ├── converter.ts  # Core conversion
│   │   ├── sanitize.ts   # Redaction & limits
│   │   └── extract.ts    # Hotspot parsing
│   ├── llm/              # LLM integration
│   │   ├── client.ts     # OpenAI/Anthropic clients
│   │   ├── prompt.ts     # Prompt templates
│   │   ├── schema.ts     # Zod schemas
│   │   └── validate.ts   # Output validation
│   ├── diff/             # Profile comparison
│   │   ├── engine.ts     # Pure TS diff engine
│   │   └── markdown.ts   # Diff report generation
│   ├── cli/              # CLI implementation
│   ├── server/           # HTTP API
│   └── skill/            # Agent integration
│       ├── handler.ts    # Skill handlers
│       └── manifest.ts   # Tool schema
├── SKILL.md              # Claude Code skill file
└── package.json
```

## API Reference

### `analyze(profile, options): Promise<AnalyzeResult>`

Analyze a single profile.

### `diff(baseProfile, currentProfile, options): Promise<DiffResult>`

Compare two profiles.

### `convertProfileToMarkdown(buffer, options): Promise<ConvertResult>`

Low-level conversion function.

### `createLLMClient(config): LLMClient`

Create an LLM client for custom integrations.

## License

MIT

### Updating Prompt Fixtures

If you change prompt templates and need to refresh fixtures:

```bash
npm run update-prompts
```
