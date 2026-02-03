/**
 * Profile diff engine - pure TypeScript implementation
 * 
 * Computes structural differences between two pprof profiles
 * without requiring the pprof Go tool.
 */

import { Profile } from "pprof-format";
import { readFile } from "node:fs/promises";
import { resolveLimits } from "../utils/limits.js";
import { decompressIfNeeded } from "../utils/fs.js";
import type {
  DiffOptions,
  NormalizeMode,
  ProfileMeta,
  DiffHotspot,
  DiffCallPath,
  ResourceLimits,
} from "../types.js";
import { logger } from "../utils/logger.js";

/**
 * Frame identity for aggregation
 */
interface FrameKey {
  name: string;
  filename?: string;
  line?: number;
}

/**
 * Aggregated function statistics
 */
interface FunctionStats {
  key: string;
  name: string;
  filename?: string;
  selfValue: number;
  cumValue: number;
  samples: number;
}

/**
 * Edge between two functions
 */
interface Edge {
  caller: string;
  callee: string;
  value: number;
}

/**
 * Parsed profile data
 */
export interface ParsedProfile {
  meta: ProfileMeta;
  functions: Map<string, FunctionStats>;
  edges: Map<string, Edge>;
  callPaths: Map<string, number>; // path string -> value
  totalValue: number;
  totalSamples: number;
}

/**
 * Diff result between two profiles
 */
export interface DiffData {
  baseMeta: ProfileMeta;
  currentMeta: ProfileMeta;
  scale: number; // scale factor applied to current
  normalizeMode: NormalizeMode;
  
  // Function-level diffs
  functionDiffs: Map<string, {
    name: string;
    filename?: string;
    baseSelf: number;
    currentSelf: number;
    deltaSelf: number;
    baseCum: number;
    currentCum: number;
    deltaCum: number;
    changeType: "regression" | "improvement" | "new" | "removed" | "unchanged";
  }>;
  
  // Top regressions and improvements
  regressions: DiffHotspot[];
  improvements: DiffHotspot[];
  newFunctions: DiffHotspot[];
  removedFunctions: DiffHotspot[];
  
  // Call path diffs for top regressions
  regressionPaths: Map<string, DiffCallPath[]>; // function name -> paths
}

/**
 * Parse a pprof profile from file path or buffer
 */
export async function parseProfile(
  input: string | Buffer | Uint8Array,
  limits?: ResourceLimits
): Promise<ParsedProfile> {
  let data: Buffer;
  const resolvedLimits = resolveLimits(limits);
  
  if (typeof input === "string") {
    data = await readFile(input);
  } else {
    data = Buffer.from(input);
  }
  
  // Decompress if gzipped (bounded to prevent zip bombs)
  data = decompressIfNeeded(data, resolvedLimits.maxDecompressedBytes);
  
  // Decode protobuf
  const profile = Profile.decode(data);
  
  return parseProfileData(profile);
}

/**
 * Parse profile protobuf into structured data
 */
function parseProfileData(profile: Profile): ParsedProfile {
  const functions = new Map<string, FunctionStats>();
  const edges = new Map<string, Edge>();
  const callPaths = new Map<string, number>();
  
  // Build lookup tables
  const stringTable = profile.stringTable || [];
  const getString = (idx: number | bigint): string => {
    const i = typeof idx === "bigint" ? Number(idx) : idx;
    return stringTable[i] || "";
  };
  
  const locationMap = new Map<bigint | number, Profile["location"][0]>();
  for (const loc of profile.location || []) {
    if (loc.id !== undefined) {
      locationMap.set(loc.id, loc);
    }
  }
  
  const functionMap = new Map<bigint | number, Profile["function"][0]>();
  for (const fn of profile.function || []) {
    if (fn.id !== undefined) {
      functionMap.set(fn.id, fn);
    }
  }
  
  // Determine sample value index (usually 0 for primary value)
  const sampleTypes = profile.sampleType || [];
  const valueIndex = 0; // Use first sample type by default
  
  // Extract metadata
  const meta: ProfileMeta = {
    sampleType: sampleTypes[valueIndex] 
      ? getString(sampleTypes[valueIndex].type ?? 0)
      : undefined,
    unit: sampleTypes[valueIndex]
      ? getString(sampleTypes[valueIndex].unit ?? 0)
      : undefined,
    durationSec: profile.durationNanos
      ? Number(profile.durationNanos) / 1e9
      : undefined,
  };
  
  // Detect profile type from sample type
  const sampleTypeName = meta.sampleType?.toLowerCase() || "";
  if (sampleTypeName.includes("cpu") || sampleTypeName.includes("sample")) {
    meta.type = "cpu";
  } else if (sampleTypeName.includes("alloc") || sampleTypeName.includes("heap") || sampleTypeName.includes("inuse")) {
    meta.type = "heap";
  }
  
  let totalValue = 0;
  let totalSamples = 0;
  
  // Process samples
  for (const sample of profile.sample || []) {
    const value = Number(sample.value?.[valueIndex] ?? 0);
    if (value === 0) continue;
    
    totalValue += value;
    totalSamples++;
    
    // Expand stack frames (locationId order: leaf -> root)
    const frames: FrameKey[] = [];
    for (const locId of sample.locationId || []) {
      const loc = locationMap.get(locId);
      if (!loc) continue;
      
      // Handle inline frames (line array, first is innermost)
      const lines = loc.line || [];
      for (const line of lines) {
        const fn = functionMap.get(line.functionId ?? BigInt(0));
        if (!fn) continue;
        
        const name = getString(fn.name ?? 0);
        const filename = getString(fn.filename ?? 0);
        
        frames.push({
          name,
          filename: filename || undefined,
          line: line.line ? Number(line.line) : undefined,
        });
      }
    }
    
    if (frames.length === 0) continue;
    
    // Track seen functions for recursive dedup (cum only counts once per sample)
    const seenForCum = new Set<string>();
    
    // Process frames
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const key = frameToKey(frame);
      
      // Initialize function stats
      if (!functions.has(key)) {
        functions.set(key, {
          key,
          name: frame.name,
          filename: frame.filename,
          selfValue: 0,
          cumValue: 0,
          samples: 0,
        });
      }
      
      const stats = functions.get(key)!;
      
      // Self (flat): only for leaf frame (index 0)
      if (i === 0) {
        stats.selfValue += value;
        stats.samples++;
      }
      
      // Cumulative: count once per sample (dedup for recursion)
      if (!seenForCum.has(key)) {
        seenForCum.add(key);
        stats.cumValue += value;
      }
      
      // Track edges (caller -> callee)
      if (i < frames.length - 1) {
        const caller = frames[i + 1];
        const callerKey = frameToKey(caller);
        const edgeKey = `${callerKey}->${key}`;
        
        if (!edges.has(edgeKey)) {
          edges.set(edgeKey, {
            caller: callerKey,
            callee: key,
            value: 0,
          });
        }
        edges.get(edgeKey)!.value += value;
      }
    }
    
    // Track call paths (root -> leaf, reversed)
    const pathFrames = frames.slice().reverse();
    const pathKey = pathFrames.map((f) => f.name).join(" → ");
    callPaths.set(pathKey, (callPaths.get(pathKey) || 0) + value);
  }
  
  meta.samples = totalSamples;
  meta.totalValue = totalValue;
  
  return {
    meta,
    functions,
    edges,
    callPaths,
    totalValue,
    totalSamples,
  };
}

/**
 * Generate stable key for a frame
 */
function frameToKey(frame: FrameKey): string {
  // Use name + filename for identity (line can vary between builds)
  if (frame.filename) {
    return `${frame.name}@${frame.filename}`;
  }
  return frame.name;
}

/**
 * Compute diff between two parsed profiles
 */
export function computeDiff(
  base: ParsedProfile,
  current: ParsedProfile,
  options: DiffOptions = {}
): DiffData {
  const normalizeMode = options.normalize || "scale-to-base-total";
  
  // Compute scale factor
  let scale = 1;
  if (normalizeMode === "scale-to-base-total" && current.totalValue > 0) {
    scale = base.totalValue / current.totalValue;
  } else if (normalizeMode === "per-second") {
    const baseDuration = base.meta.durationSec || 1;
    const currentDuration = current.meta.durationSec || 1;
    scale = baseDuration / currentDuration;
  }
  
  logger.debug("Diff scale factor", { 
    normalizeMode, 
    scale,
    baseTotalValue: base.totalValue,
    currentTotalValue: current.totalValue,
  });
  
  // Compute function-level diffs
  const allFunctions = new Set([
    ...base.functions.keys(),
    ...current.functions.keys(),
  ]);
  
  const functionDiffs = new Map<string, DiffData["functionDiffs"] extends Map<string, infer V> ? V : never>();
  
  for (const key of allFunctions) {
    const baseStats = base.functions.get(key);
    const currentStats = current.functions.get(key);
    
    const baseSelf = baseStats?.selfValue ?? 0;
    const baseCum = baseStats?.cumValue ?? 0;
    const currentSelf = (currentStats?.selfValue ?? 0) * scale;
    const currentCum = (currentStats?.cumValue ?? 0) * scale;
    
    const deltaSelf = currentSelf - baseSelf;
    const deltaCum = currentCum - baseCum;
    
    // Determine change type
    let changeType: "regression" | "improvement" | "new" | "removed" | "unchanged";
    if (!baseStats) {
      changeType = "new";
    } else if (!currentStats) {
      changeType = "removed";
    } else if (deltaSelf > 0) {
      changeType = "regression";
    } else if (deltaSelf < 0) {
      changeType = "improvement";
    } else {
      changeType = "unchanged";
    }
    
    functionDiffs.set(key, {
      name: currentStats?.name ?? baseStats?.name ?? key,
      filename: currentStats?.filename ?? baseStats?.filename,
      baseSelf,
      currentSelf,
      deltaSelf,
      baseCum,
      currentCum,
      deltaCum,
      changeType,
    });
  }
  
  // Sort and extract top regressions/improvements
  const minAbsDelta = options.minAbsoluteDelta ?? 0;
  const minPctDelta = options.minPercentDelta ?? 0;
  const maxRegressions = options.maxRegressions ?? 10;
  const maxImprovements = options.maxImprovements ?? 5;
  
  const sortedDiffs = [...functionDiffs.entries()]
    .map(([key, diff]) => ({ key, ...diff }))
    .filter((d) => {
      const absDelta = Math.abs(d.deltaSelf);
      const pctDelta = d.baseSelf > 0 ? (absDelta / d.baseSelf) * 100 : 100;
      return absDelta >= minAbsDelta && pctDelta >= minPctDelta;
    });
  
  // Regressions (positive delta, sorted by delta descending)
  const regressions = sortedDiffs
    .filter((d) => d.changeType === "regression")
    .sort((a, b) => b.deltaSelf - a.deltaSelf)
    .slice(0, maxRegressions)
    .map((d, idx) => toDiffHotspot(d, idx + 1, base.totalValue, current.totalValue * scale));
  
  // Improvements (negative delta, sorted by delta ascending)
  const improvements = sortedDiffs
    .filter((d) => d.changeType === "improvement")
    .sort((a, b) => a.deltaSelf - b.deltaSelf)
    .slice(0, maxImprovements)
    .map((d, idx) => toDiffHotspot(d, idx + 1, base.totalValue, current.totalValue * scale));
  
  // New and removed functions
  const newFunctions = sortedDiffs
    .filter((d) => d.changeType === "new")
    .sort((a, b) => b.currentSelf - a.currentSelf)
    .slice(0, 5)
    .map((d, idx) => toDiffHotspot(d, idx + 1, base.totalValue, current.totalValue * scale));
  
  const removedFunctions = sortedDiffs
    .filter((d) => d.changeType === "removed")
    .sort((a, b) => b.baseSelf - a.baseSelf)
    .slice(0, 5)
    .map((d, idx) => toDiffHotspot(d, idx + 1, base.totalValue, current.totalValue * scale));
  
  // Compute call path diffs for top regressions
  const regressionPaths = new Map<string, DiffCallPath[]>();
  
  for (const reg of regressions.slice(0, 5)) {
    const paths = computeCallPathDiffs(base, current, reg.function, scale);
    if (paths.length > 0) {
      regressionPaths.set(reg.function, paths);
    }
  }
  
  return {
    baseMeta: base.meta,
    currentMeta: current.meta,
    scale,
    normalizeMode,
    functionDiffs,
    regressions,
    improvements,
    newFunctions,
    removedFunctions,
    regressionPaths,
  };
}

/**
 * Convert diff data to DiffHotspot
 */
function toDiffHotspot(
  diff: { 
    name: string; 
    filename?: string;
    baseSelf: number;
    currentSelf: number;
    deltaSelf: number;
    baseCum: number;
    currentCum: number;
    deltaCum: number;
    changeType: "regression" | "improvement" | "new" | "removed" | "unchanged";
  },
  rank: number,
  baseTotalValue: number,
  currentTotalValue: number
): DiffHotspot {
  return {
    rank,
    function: diff.name,
    location: diff.filename,
    deltaSelf: diff.deltaSelf,
    deltaCum: diff.deltaCum,
    deltaSelfPct: baseTotalValue > 0 ? (diff.deltaSelf / baseTotalValue) * 100 : 0,
    deltaCumPct: baseTotalValue > 0 ? (diff.deltaCum / baseTotalValue) * 100 : 0,
    baseSelf: diff.baseSelf,
    baseCum: diff.baseCum,
    baseSelfPct: baseTotalValue > 0 ? (diff.baseSelf / baseTotalValue) * 100 : undefined,
    baseCumPct: baseTotalValue > 0 ? (diff.baseCum / baseTotalValue) * 100 : undefined,
    currentSelf: diff.currentSelf,
    currentCum: diff.currentCum,
    currentSelfPct: currentTotalValue > 0 ? (diff.currentSelf / currentTotalValue) * 100 : undefined,
    currentCumPct: currentTotalValue > 0 ? (diff.currentCum / currentTotalValue) * 100 : undefined,
    changeType: diff.changeType,
  };
}

/**
 * Compute call path diffs for a specific function
 */
function computeCallPathDiffs(
  base: ParsedProfile,
  current: ParsedProfile,
  functionName: string,
  scale: number
): DiffCallPath[] {
  const allPaths = new Set<string>();
  
  // Find paths containing this function
  for (const [path] of base.callPaths) {
    if (path.includes(functionName)) {
      allPaths.add(path);
    }
  }
  for (const [path] of current.callPaths) {
    if (path.includes(functionName)) {
      allPaths.add(path);
    }
  }
  
  const pathDiffs: DiffCallPath[] = [];
  
  for (const pathStr of allPaths) {
    const baseValue = base.callPaths.get(pathStr) ?? 0;
    const currentValue = (current.callPaths.get(pathStr) ?? 0) * scale;
    const delta = currentValue - baseValue;
    
    if (Math.abs(delta) > 0) {
      pathDiffs.push({
        path: pathStr.split(" → "),
        deltaValue: delta,
        baseValue,
        currentValue,
      });
    }
  }
  
  // Sort by absolute delta descending
  return pathDiffs
    .sort((a, b) => Math.abs(b.deltaValue) - Math.abs(a.deltaValue))
    .slice(0, 5);
}

/**
 * Run diff analysis on two profile files
 */
export async function diffProfiles(
  basePath: string | Buffer | Uint8Array,
  currentPath: string | Buffer | Uint8Array,
  options: DiffOptions = {}
): Promise<DiffData> {
  const startTime = performance.now();
  
  logger.info("Parsing profiles for diff");
  
  const [baseProfile, currentProfile] = await Promise.all([
    parseProfile(basePath, options.limits),
    parseProfile(currentPath, options.limits),
  ]);
  
  const parseTime = performance.now() - startTime;
  logger.debug("Profile parsing complete", { 
    parseMs: Math.round(parseTime),
    baseFunctions: baseProfile.functions.size,
    currentFunctions: currentProfile.functions.size,
  });
  
  const diff = computeDiff(baseProfile, currentProfile, options);
  
  const totalTime = performance.now() - startTime;
  logger.info("Diff analysis complete", {
    totalMs: Math.round(totalTime),
    regressions: diff.regressions.length,
    improvements: diff.improvements.length,
  });
  
  return diff;
}
