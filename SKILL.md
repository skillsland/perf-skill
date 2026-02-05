---
name: perf-skill
description: Convert pprof CPU and heap profiles to structured Markdown and JSON evidence. Use when the user has a .pb.gz profile file and wants to understand performance bottlenecks or compare profiles.
argument-hint: "[profile.pb.gz] [options]"
allowed-tools: Bash(node *), Bash(npx *), Read, Glob
---

# perf-skill: Performance Profile Evidence Extractor

Convert pprof profiles (.pb.gz) to structured Markdown and JSON for performance analysis. This tool produces **deterministic, evidence-based output** that you (the agent) can use to generate optimization recommendations.

## Design Philosophy

- **Deterministic by default**: No external API calls or LLM dependencies
- **Evidence-first**: Produces structured hotspots, call paths, and metrics
- **Agent-friendly**: You (Claude/Cursor/any coding agent) provide the analysis and recommendations based on the evidence

## Quick Start

### Analyze a Single Profile

```bash
# Convert profile to structured markdown and JSON (default, no LLM required)
npx perf-skill analyze $ARGUMENTS -o analysis.md -j results.json

# Or use the convert command (explicitly no LLM)
npx perf-skill convert $ARGUMENTS -o report.md
```

### Compare Two Profiles (Diff)

```bash
# Compare base vs current profile
npx perf-skill diff base.pb.gz current.pb.gz -o diff.md -j diff.json
```

### Profile a Node.js Application

```bash
# Profile and convert in one step
npx perf-skill run slow.mjs --duration 10s -o cpu.md -j cpu.json

# With heap profiling
npx perf-skill run slow.mjs --heap --output cpu.md --heap-output heap.md
```

## Workflow for Performance Analysis

1. **Run perf-skill** to generate evidence (markdown + JSON)
2. **Read the output** to understand hotspots and call paths
3. **Generate recommendations** based on the evidence (this is YOUR job as the agent)
4. **Implement changes** and re-run profiling to verify improvements

## When to Use This Skill

Use `perf-skill` when:
- User provides a `.pb.gz` pprof profile file
- User asks "why is my app slow?" with a profile attached
- User wants to compare performance before/after a change
- User needs help interpreting profile data
- User asks about CPU or memory hotspots

## Available Commands

### `analyze` (default)

Convert a profile to structured Markdown. Default mode is `convert-only` (no external dependencies).

```bash
perf-skill analyze profile.pb.gz [options]
```

**Key Options:**
- `-f, --format <format>`: Output format (`summary`, `detailed`, `adaptive`)
- `-t, --type <type>`: Profile type (`cpu`, `heap`, `auto`)
- `-o, --output <file>`: Save markdown to file
- `-j, --json <file>`: Save JSON results to file (for programmatic access)
- `--max-hotspots <n>`: Limit hotspots shown (default: 10)
- `--service <name>`: Service name for context
- `--scenario <desc>`: Scenario description

### `diff`

Compare two profiles to find performance regressions.

```bash
perf-skill diff base.pb.gz current.pb.gz [options]
```

**Key Options:**
- `-f, --format <format>`: `diff-summary`, `diff-detailed`, `diff-adaptive`
- `-n, --normalize <mode>`: `none`, `scale-to-base-total`, `per-second`
- `-o, --output <file>`: Save markdown to file
- `-j, --json <file>`: Save JSON results to file
- `--max-regressions <n>`: Limit regressions shown (default: 10)
- `--max-improvements <n>`: Limit improvements shown (default: 5)

### `convert`

Explicitly convert profile to markdown (same as analyze with default settings).

```bash
perf-skill convert profile.pb.gz -o report.md
```

### `run`

Profile a Node.js entry file and convert the results.

```bash
perf-skill run slow.mjs --duration 10s -o cpu.md
```

### `profile`

Only generate profile files without conversion.

```bash
perf-skill profile slow.mjs --duration 10s -o cpu.pb.gz
```

## Understanding the Output

### Hotspots (JSON structure)

```json
{
  "hotspots": [
    {
      "rank": 1,
      "function": "processRequest",
      "selfPct": 23.4,
      "cumPct": 67.8,
      "location": "src/handler.ts:142",
      "callPath": ["main", "handleHttp", "processRequest"]
    }
  ]
}
```

- **selfPct**: Time/memory spent in this function only (high = expensive work)
- **cumPct**: Time/memory including callees (high = hot path entry point)
- **callPath**: Call stack from root to this function

### Diff Analysis (JSON structure)

```json
{
  "regressions": [...],
  "improvements": [...],
  "summary": ["Overall performance regressed by ~5%", "..."]
}
```

## Tips for Analysis

1. **High self%** = function is doing expensive work directly → optimize the function body
2. **High cum%** = function is on a hot path → may need to call faster alternatives or cache
3. **Native functions** (like `JSON.parse`) at top → consider streaming/binary alternatives
4. **Compare profiles** to find the cause of regressions after code changes
5. **Low sample count** → run profiler longer for statistical significance

## Example Agent Workflow

```markdown
User: "My API is slow, here's the profile: cpu.pb.gz"

Agent:
1. Run: `npx perf-skill analyze cpu.pb.gz -o analysis.md -j results.json`
2. Read the output files
3. Analyze hotspots and generate recommendations:
   - "JSON.parse at 23% - consider streaming JSON parser"
   - "processRequest has high cumulative time - trace callees"
4. Implement changes
5. Re-profile and use `perf-skill diff` to verify improvement
```

## Requirements

- Node.js >= 20

## Troubleshooting

### "No symbols found"
The profile may be from a production build without debug info. Analysis still works but function names may be mangled.

### "Native code dominates"
If native functions (like `JSON.parse`) are top hotspots, consider:
- Using streaming parsers for large JSON
- Caching parsed results
- Using binary formats like Protocol Buffers

### "Low sample count"
Run the profiler longer to get more samples for statistical significance.
