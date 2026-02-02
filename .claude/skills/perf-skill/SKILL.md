---
name: perf-skill
description: Analyze pprof CPU and heap profiles with AI-powered recommendations. Use when the user has a .pb.gz profile file and wants to understand performance bottlenecks, compare profiles, or get optimization suggestions.
argument-hint: [profile.pb.gz] [options]
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
- User asks "why is my app slow?" with a profile attached
- User wants to compare performance before/after a change
- User needs help interpreting profile data
- User asks about CPU or memory hotspots

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
