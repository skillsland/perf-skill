/**
 * Generate markdown diff report from DiffData
 */

import type { DiffData } from "./engine.js";
import type { DiffFormat, DiffHotspot, DiffCallPath } from "../types.js";
import { formatBytes } from "../utils/limits.js";

export interface DiffMarkdownOptions {
  format?: DiffFormat;
  maxRegressions?: number;
  maxImprovements?: number;
  includeCallPaths?: boolean;
}

/**
 * Generate markdown diff report
 */
export function generateDiffMarkdown(
  diff: DiffData,
  options: DiffMarkdownOptions = {}
): string {
  const format = options.format || "diff-adaptive";
  
  switch (format) {
    case "diff-summary":
      return generateSummaryFormat(diff, options);
    case "diff-detailed":
      return generateDetailedFormat(diff, options);
    case "diff-adaptive":
    default:
      return generateAdaptiveFormat(diff, options);
  }
}

/**
 * Generate summary format (compact)
 */
function generateSummaryFormat(
  diff: DiffData,
  options: DiffMarkdownOptions
): string {
  const lines: string[] = [];
  
  // Header
  lines.push("# Profile Diff Summary");
  lines.push("");
  
  // Quick stats
  lines.push("## Overview");
  lines.push("");
  lines.push(`| Metric | Base | Current | Change |`);
  lines.push(`|--------|------|---------|--------|`);
  lines.push(`| Total Value | ${formatValue(diff.baseMeta.totalValue || 0, diff.baseMeta.unit)} | ${formatValue((diff.currentMeta.totalValue || 0) * diff.scale, diff.currentMeta.unit)} | ${formatDelta((diff.currentMeta.totalValue || 0) * diff.scale - (diff.baseMeta.totalValue || 0))} |`);
  lines.push(`| Samples | ${diff.baseMeta.samples || 0} | ${diff.currentMeta.samples || 0} | ${formatDelta((diff.currentMeta.samples || 0) - (diff.baseMeta.samples || 0))} |`);
  lines.push(`| Normalize Mode | ${diff.normalizeMode} | Scale: ${diff.scale.toFixed(3)} | |`);
  lines.push("");
  
  // Top regressions
  const maxReg = options.maxRegressions ?? 5;
  if (diff.regressions.length > 0) {
    lines.push("## Top Regressions");
    lines.push("");
    lines.push("| Rank | Function | ΔSelf | Base% | Current% |");
    lines.push("|------|----------|-------|-------|----------|");
    
    for (const reg of diff.regressions.slice(0, maxReg)) {
      lines.push(formatHotspotRow(reg));
    }
    lines.push("");
  }
  
  // Top improvements
  const maxImp = options.maxImprovements ?? 3;
  if (diff.improvements.length > 0) {
    lines.push("## Top Improvements");
    lines.push("");
    lines.push("| Rank | Function | ΔSelf | Base% | Current% |");
    lines.push("|------|----------|-------|-------|----------|");
    
    for (const imp of diff.improvements.slice(0, maxImp)) {
      lines.push(formatHotspotRow(imp));
    }
    lines.push("");
  }
  
  return lines.join("\n");
}

/**
 * Generate detailed format (full info)
 */
function generateDetailedFormat(
  diff: DiffData,
  options: DiffMarkdownOptions
): string {
  const lines: string[] = [];
  
  // Header
  lines.push("# Profile Diff Analysis");
  lines.push("");
  
  // Metadata comparison
  lines.push("## Profile Metadata");
  lines.push("");
  lines.push("### Base Profile");
  lines.push("");
  lines.push(formatMetadata(diff.baseMeta));
  lines.push("");
  lines.push("### Current Profile");
  lines.push("");
  lines.push(formatMetadata(diff.currentMeta));
  lines.push("");
  lines.push(`**Normalization:** ${diff.normalizeMode} (scale factor: ${diff.scale.toFixed(4)})`);
  lines.push("");
  
  // Executive summary
  lines.push("## Executive Summary");
  lines.push("");
  lines.push(generateExecutiveSummary(diff));
  lines.push("");
  
  // Detailed regressions
  if (diff.regressions.length > 0) {
    lines.push("## Regressions (Performance Degraded)");
    lines.push("");
    lines.push("| Rank | Function | ΔSelf | ΔCum | Base Self% | Curr Self% | Location |");
    lines.push("|------|----------|-------|------|------------|------------|----------|");
    
    for (const reg of diff.regressions) {
      lines.push(formatDetailedRow(reg));
    }
    lines.push("");
    
    // Call path details for top regressions
    if (options.includeCallPaths !== false) {
      lines.push("### Regression Call Paths");
      lines.push("");
      
      for (const [funcName, paths] of diff.regressionPaths) {
        if (paths.length > 0) {
          lines.push(`#### \`${funcName}\``);
          lines.push("");
          lines.push("| Path | ΔValue | Base | Current |");
          lines.push("|------|--------|------|---------|");
          
          for (const path of paths) {
            lines.push(formatPathRow(path));
          }
          lines.push("");
        }
      }
    }
  }
  
  // Detailed improvements
  if (diff.improvements.length > 0) {
    lines.push("## Improvements (Performance Improved)");
    lines.push("");
    lines.push("| Rank | Function | ΔSelf | ΔCum | Base Self% | Curr Self% | Location |");
    lines.push("|------|----------|-------|------|------------|------------|----------|");
    
    for (const imp of diff.improvements) {
      lines.push(formatDetailedRow(imp));
    }
    lines.push("");
  }
  
  // New functions
  if (diff.newFunctions && diff.newFunctions.length > 0) {
    lines.push("## New Functions (Not in Base)");
    lines.push("");
    lines.push("| Function | Self | Cum | Location |");
    lines.push("|----------|------|-----|----------|");
    
    for (const fn of diff.newFunctions) {
      lines.push(`| \`${fn.function}\` | ${formatValue(fn.currentSelf || 0)} | ${formatValue(fn.currentCum || 0)} | ${fn.location || "-"} |`);
    }
    lines.push("");
  }
  
  // Removed functions
  if (diff.removedFunctions && diff.removedFunctions.length > 0) {
    lines.push("## Removed Functions (Not in Current)");
    lines.push("");
    lines.push("| Function | Was Self | Was Cum | Location |");
    lines.push("|----------|----------|---------|----------|");
    
    for (const fn of diff.removedFunctions) {
      lines.push(`| \`${fn.function}\` | ${formatValue(fn.baseSelf || 0)} | ${formatValue(fn.baseCum || 0)} | ${fn.location || "-"} |`);
    }
    lines.push("");
  }
  
  return lines.join("\n");
}

/**
 * Generate adaptive format (summary + drilldown)
 */
function generateAdaptiveFormat(
  diff: DiffData,
  options: DiffMarkdownOptions
): string {
  const lines: string[] = [];
  
  // Header
  lines.push("# Profile Comparison Report");
  lines.push("");
  
  // Executive summary
  lines.push("## Executive Summary");
  lines.push("");
  lines.push(generateExecutiveSummary(diff));
  lines.push("");
  
  // Quick comparison table
  lines.push("## Overview");
  lines.push("");
  lines.push(`| Metric | Base | Current | Δ |`);
  lines.push(`|--------|------|---------|---|`);
  
  const baseTotalStr = formatValue(diff.baseMeta.totalValue || 0, diff.baseMeta.unit);
  const currentTotalScaled = (diff.currentMeta.totalValue || 0) * diff.scale;
  const currentTotalStr = formatValue(currentTotalScaled, diff.currentMeta.unit);
  const totalDelta = currentTotalScaled - (diff.baseMeta.totalValue || 0);
  
  lines.push(`| Total | ${baseTotalStr} | ${currentTotalStr} | ${formatDelta(totalDelta)} |`);
  lines.push(`| Regressions | - | - | ${diff.regressions.length} functions |`);
  lines.push(`| Improvements | - | - | ${diff.improvements.length} functions |`);
  lines.push("");
  
  // Top regressions with anchors
  if (diff.regressions.length > 0) {
    lines.push("## Top Regressions");
    lines.push("");
    
    const maxReg = options.maxRegressions ?? 5;
    for (let i = 0; i < Math.min(diff.regressions.length, maxReg); i++) {
      const reg = diff.regressions[i];
      const anchor = generateAnchor(reg.function);
      lines.push(`${i + 1}. \`${reg.function}\` (**${formatDelta(reg.deltaSelf)}**) → [Details](#${anchor})`);
    }
    lines.push("");
  }
  
  // Top improvements
  if (diff.improvements.length > 0) {
    lines.push("## Top Improvements");
    lines.push("");
    
    const maxImp = options.maxImprovements ?? 3;
    for (let i = 0; i < Math.min(diff.improvements.length, maxImp); i++) {
      const imp = diff.improvements[i];
      lines.push(`${i + 1}. \`${imp.function}\` (${formatDelta(imp.deltaSelf)})`);
    }
    lines.push("");
  }
  
  // Detailed analysis for regressions
  lines.push("---");
  lines.push("");
  lines.push("## Detailed Analysis");
  lines.push("");
  
  for (const reg of diff.regressions.slice(0, options.maxRegressions ?? 5)) {
    const anchor = generateAnchor(reg.function);
    lines.push(`<a id="${anchor}"></a>`);
    lines.push("");
    lines.push(`### \`${reg.function}\``);
    lines.push("");
    lines.push(`**Change:** ${formatDelta(reg.deltaSelf)} self-time (${reg.baseSelfPct?.toFixed(1) || "0"}% → ${reg.currentSelfPct?.toFixed(1) || "0"}%)`);
    lines.push("");
    
    if (reg.location) {
      lines.push(`**Location:** \`${reg.location}\``);
      lines.push("");
    }
    
    // Call paths if available
    const paths = diff.regressionPaths.get(reg.function);
    if (paths && paths.length > 0) {
      lines.push("**Top Contributing Paths:**");
      lines.push("");
      for (const path of paths.slice(0, 3)) {
        const pathStr = path.path.map((p) => `\`${p}\``).join(" → ");
        lines.push(`- ${pathStr}`);
        lines.push(`  - Δ: ${formatDelta(path.deltaValue)}`);
      }
      lines.push("");
    }
  }
  
  return lines.join("\n");
}

/**
 * Generate executive summary bullets
 */
function generateExecutiveSummary(diff: DiffData): string {
  const bullets: string[] = [];
  
  // Overall change direction
  const totalDelta = (diff.currentMeta.totalValue || 0) * diff.scale - (diff.baseMeta.totalValue || 0);
  const totalBasePct = diff.baseMeta.totalValue ? (totalDelta / diff.baseMeta.totalValue) * 100 : 0;
  
  if (Math.abs(totalBasePct) < 1) {
    bullets.push("- **Overall:** Performance is roughly unchanged (< 1% delta)");
  } else if (totalDelta > 0) {
    bullets.push(`- **Overall:** Performance regressed by ~${totalBasePct.toFixed(1)}%`);
  } else {
    bullets.push(`- **Overall:** Performance improved by ~${Math.abs(totalBasePct).toFixed(1)}%`);
  }
  
  // Top regression
  if (diff.regressions.length > 0) {
    const top = diff.regressions[0];
    bullets.push(`- **Largest regression:** \`${top.function}\` (+${top.deltaSelfPct.toFixed(1)}% of total)`);
  }
  
  // Top improvement
  if (diff.improvements.length > 0) {
    const top = diff.improvements[0];
    bullets.push(`- **Largest improvement:** \`${top.function}\` (${top.deltaSelfPct.toFixed(1)}% of total)`);
  }
  
  // New functions contributing
  if (diff.newFunctions && diff.newFunctions.length > 0) {
    const newTotal = diff.newFunctions.reduce((sum, f) => sum + (f.currentSelf || 0), 0);
    if (newTotal > 0 && diff.currentMeta.totalValue) {
      const newPct = (newTotal / (diff.currentMeta.totalValue * diff.scale)) * 100;
      bullets.push(`- **New code:** ${diff.newFunctions.length} new functions contributing ${newPct.toFixed(1)}%`);
    }
  }
  
  return bullets.join("\n");
}

/**
 * Format hotspot row for summary table
 */
function formatHotspotRow(h: DiffHotspot): string {
  return `| ${h.rank} | \`${h.function}\` | ${formatDelta(h.deltaSelf)} | ${h.baseSelfPct?.toFixed(1) || "-"}% | ${h.currentSelfPct?.toFixed(1) || "-"}% |`;
}

/**
 * Format detailed row
 */
function formatDetailedRow(h: DiffHotspot): string {
  return `| ${h.rank} | \`${h.function}\` | ${formatDelta(h.deltaSelf)} | ${formatDelta(h.deltaCum)} | ${h.baseSelfPct?.toFixed(1) || "-"}% | ${h.currentSelfPct?.toFixed(1) || "-"}% | ${h.location || "-"} |`;
}

/**
 * Format call path row
 */
function formatPathRow(p: DiffCallPath): string {
  const pathStr = p.path.slice(-3).map((s) => `\`${s}\``).join(" → ");
  return `| ${p.path.length > 3 ? "…" : ""}${pathStr} | ${formatDelta(p.deltaValue)} | ${formatValue(p.baseValue || 0)} | ${formatValue(p.currentValue || 0)} |`;
}

/**
 * Format metadata block
 */
function formatMetadata(meta: import("../types.js").ProfileMeta): string {
  const lines: string[] = [];
  if (meta.type) lines.push(`- **Type:** ${meta.type}`);
  if (meta.sampleType) lines.push(`- **Sample Type:** ${meta.sampleType}`);
  if (meta.unit) lines.push(`- **Unit:** ${meta.unit}`);
  if (meta.samples) lines.push(`- **Samples:** ${meta.samples.toLocaleString()}`);
  if (meta.durationSec) lines.push(`- **Duration:** ${meta.durationSec.toFixed(1)}s`);
  if (meta.totalValue) lines.push(`- **Total Value:** ${formatValue(meta.totalValue, meta.unit)}`);
  return lines.join("\n");
}

/**
 * Format a value with optional unit
 */
function formatValue(value: number, unit?: string): string {
  if (unit?.includes("byte")) {
    return formatBytes(Math.abs(value));
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toFixed(0);
}

/**
 * Format a delta value with sign
 */
function formatDelta(delta: number, unit?: string): string {
  const sign = delta > 0 ? "+" : "";
  return `${sign}${formatValue(delta, unit)}`;
}

/**
 * Generate URL-safe anchor from function name
 */
function generateAnchor(name: string): string {
  return name
    .toLowerCase()
    .replace(/[<>]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-_]/g, "")
    .replace(/-+/g, "-")
    .slice(0, 50);
}
