---
name: perf-skill
description: Analyze pprof CPU and heap profiles with AI-powered recommendations, or profile a Node.js entry file and generate a full report. Use when the user has a .pb.gz profile file or wants to profile a Node.js script and get optimization suggestions.
argument-hint: [profile.pb.gz|entry.js] [options]
allowed-tools: Bash(node *), Bash(npx *), Read, Glob
---

# perf-skill: Performance Profile Analysis Skill

Analyze pprof profiles (.pb.gz) to identify performance bottlenecks and generate actionable optimization recommendations.

## Quick Start

### Analyze a Single Profile

```bash
# Quick conversion to markdown (no LLM)
npx perf-skill convert $ARGUMENTS

# Full analysis with AI recommendations
npx perf-skill analyze $ARGUMENTS --mode analyze

# Output to file
npx perf-skill analyze $ARGUMENTS -o analysis.md -j results.json
```

### Profile a Node Entry and Analyze (One Command)

```bash
# Default CPU profiling (10s) + analysis
npx perf-skill run slow.mjs

# Customize duration and output
npx perf-skill run slow.mjs --duration 10s -o analysis.md

# CPU + Heap profiling (separate reports)
npx perf-skill run slow.mjs --heap --output cpu.md --heap-output heap.md
```

### Compare Two Profiles (Diff)

```bash
# Compare base vs current profile
npx perf-skill diff base.pb.gz current.pb.gz

# With specific format
npx perf-skill diff base.pb.gz current.pb.gz --format diff-detailed
```

## When to Use This Skill

Use `perf-skill` when:
- User provides a `.pb.gz` pprof profile file
- User provides a Node.js entry file (`.js/.mjs/.cjs`) and wants an end-to-end performance report
- User asks "why is my app slow?" with a profile attached
- User wants to compare performance before/after a change
- User needs help interpreting profile data
- User asks about CPU or memory hotspots

## Routing

- If the argument ends with `.pb`, `.pb.gz`, or `.pprof`, run `analyze` or `diff` directly.
- If the argument ends with `.js`, `.mjs`, or `.cjs`, run `perf-skill run <entry>` to generate a CPU profile and analyze it.
- If the user asks for both CPU and heap (including misspellings like "heep" or terms like "memory"/"heap"), add `--heap` and save separate reports (`--output` + `--heap-output`).

## Available Commands

### `analyze` (default)

Analyze a single profile with optional AI recommendations.

```bash
perf-skill analyze profile.pb.gz [options]
```

**Options:**
- `-f, --format <format>`: Output format (`summary`, `detailed`, `adaptive`)
- `-t, --type <type>`: Profile type (`cpu`, `heap`, `auto`)
- `-o, --output <file>`: Save markdown to file
- `-j, --json <file>`: Save JSON results to file
- `-m, --mode <mode>`: `convert-only` (no LLM) or `analyze` (with LLM)
- `-s, --source-dir <path>`: Include source code context
- `--max-hotspots <n>`: Limit hotspots shown (default: 10)
- `--service <name>`: Service name for context
- `--scenario <desc>`: Scenario description

### `diff`

Compare two profiles to find performance regressions.

```bash
perf-skill diff base.pb.gz current.pb.gz [options]
```

**Options:**
- `-f, --format <format>`: `diff-summary`, `diff-detailed`, `diff-adaptive`
- `-n, --normalize <mode>`: `none`, `scale-to-base-total`, `per-second`
- `--max-regressions <n>`: Limit regressions shown (default: 10)
- `--max-improvements <n>`: Limit improvements shown (default: 5)

### `convert`

Convert profile to markdown without AI analysis (faster).

```bash
perf-skill convert profile.pb.gz -o report.md
```

### `run`

Profile a Node entry file (CPU) and analyze the resulting profile.

```bash
perf-skill run entry.js [entryArgs...]
```

**Options:**
- `-d, --duration <duration>`: Profiling duration (default: `10s`)
- `--profile-out <file>`: Profile output file (default: `cpu.pb.gz`)
- `--heap`: Also capture heap profile
- `--heap-profile-out <file>`: Heap profile output file (default: `heap.pb.gz`)
- `--heap-output <file>`: Heap markdown output file (default: derived from CPU output or `heap.md`)
- `--heap-json <file>`: Heap JSON output file (optional)
- `--heap-interval-bytes <n>`: Heap sampling interval (bytes, default: `524288`)
- `--heap-stack-depth <n>`: Heap sampling stack depth (default: `64`)
- All `analyze` options (`--format`, `--mode`, `--output`, etc.)

When `--heap` is enabled and `--output` is omitted, the CLI writes `cpu.md` and `heap.md` instead of printing to stdout.

### `profile`

Generate a CPU profile for a Node entry file without analysis.

```bash
perf-skill profile entry.js [entryArgs...]
```

**Options:**
- `-d, --duration <duration>`: Profiling duration (default: `10s`)
- `-o, --output <file>`: Profile output file (default: `cpu.pb.gz`)
- `--heap`: Also capture heap profile
- `--heap-profile-out <file>`: Heap profile output file (default: `heap.pb.gz`)
- `--heap-interval-bytes <n>`: Heap sampling interval (bytes, default: `524288`)
- `--heap-stack-depth <n>`: Heap sampling stack depth (default: `64`)

## Programmatic Usage

```typescript
import { analyze, diff } from 'perf-skill';

// Analyze with AI
const result = await analyze('cpu.pb.gz', {
  mode: 'analyze',
  context: { serviceName: 'api-server' }
});

console.log(result.markdown);
console.log(result.recommendations);

// Compare profiles
const diffResult = await diff('base.pb.gz', 'current.pb.gz');
console.log(diffResult.regressions);
```

## Understanding the Output

### Hotspots

Functions ranked by CPU time or memory allocation:
- **Self%**: Time spent in this function only
- **Cum%**: Time spent in this function + its callees
- **Location**: Source file and line number

### Recommendations (AI mode)

Each recommendation includes:
- **Title**: What to do
- **Rationale**: Why (with evidence from the profile)
- **Steps**: How to implement
- **Impact/Risk/Confidence**: Prioritization info

### Diff Analysis

When comparing profiles:
- **Regressions**: Functions that got slower
- **Improvements**: Functions that got faster
- **Call Path Δ**: Which paths contributed to the change

## Collecting Profiles

### Node.js with @datadog/pprof

```typescript
import * as pprof from '@datadog/pprof';
import { writeFileSync } from 'fs';
import { gzipSync } from 'zlib';

// CPU profiling (30 seconds)
pprof.time.start({ durationMillis: 30000 });
// ... run your workload ...
const profile = await pprof.time.stop();
writeFileSync('cpu.pb.gz', gzipSync(profile.encode()));

// Heap profiling
pprof.heap.start(512 * 1024, 64);
// ... run your workload ...
const heapProfile = await pprof.heap.profile();
writeFileSync('heap.pb.gz', gzipSync(heapProfile.encode()));
```

## Tips

1. **Start with `--format summary`** for quick triage
2. **Use `--mode convert-only`** when you just need the markdown
3. **Compare profiles** to find the cause of regressions
4. **Provide context** (`--service`, `--scenario`) for better AI recommendations
5. **High self%** = function is doing expensive work directly
6. **High cum%** = function is on a hot path (may be calling slow functions)

## Requirements

- Node.js >= 22.6.0
- For AI analysis: Set `OPENAI_API_KEY` or configure LLM provider
- CPU profiling uses bundled `@datadog/pprof` (native module); supported on common platforms

## Troubleshooting

### "No symbols found"
The profile may be from a production build without debug info. The analysis still works but function names may be mangled.

### "Native code dominates"
If native functions (like `JSON.parse`) are top hotspots, consider:
- Using streaming parsers for large JSON
- Caching parsed results
- Using binary formats like Protocol Buffers

### "Low sample count"
Run the profiler longer to get more samples for statistical significance.
