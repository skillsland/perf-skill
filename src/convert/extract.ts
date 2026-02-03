/**
 * Extract structured data from pprof-to-md markdown output
 * 
 * Best-effort parsing - falls back gracefully when format doesn't match
 */

import type { Hotspot, ProfileMeta } from "../types.js";

/**
 * Extract profile metadata from markdown
 */
export function extractProfileMeta(markdown: string): ProfileMeta | undefined {
  const meta: ProfileMeta = {};
  const normalized = markdown.replace(/\*\*/g, "");
  
  // Try to extract profile type from header
  // e.g., "# PPROF Analysis: CPU" or "# PPROF Analysis: Heap"
  const typeMatch = normalized.match(/# PPROF Analysis:\s*(CPU|Heap)/i);
  if (typeMatch) {
    meta.type = typeMatch[1].toLowerCase() as "cpu" | "heap";
  }
  
  // Extract duration
  // e.g., "**Duration:** 30s" or "Duration: 30.5s"
  const durationMatch = normalized.match(/Duration:\s*([\d.]+)\s*s/i);
  if (durationMatch) {
    meta.durationSec = parseFloat(durationMatch[1]);
  }
  
  // Extract samples
  // e.g., "**Samples:** 45,231" or "Samples: 45231"
  const samplesMatch = normalized.match(/Samples:\s*([\d,]+)/i);
  if (samplesMatch) {
    meta.samples = parseInt(samplesMatch[1].replace(/,/g, ""), 10);
  }
  
  // Extract sample type
  // e.g., "Sample Type: cpu" or "Type: alloc_space"
  const sampleTypeMatch = normalized.match(/Sample Type:\s*(\w+)/i);
  if (sampleTypeMatch) {
    meta.sampleType = sampleTypeMatch[1];
  }
  
  // Extract unit
  const unitMatch = normalized.match(/Unit:\s*(\w+)/i);
  if (unitMatch) {
    meta.unit = unitMatch[1];
  }
  
  return Object.keys(meta).length > 0 ? meta : undefined;
}

/**
 * Extract hotspots from markdown
 * Handles both table format and list format
 */
export function extractHotspots(markdown: string): Hotspot[] {
  // Try table format first (more structured)
  const tableHotspots = extractHotspotsFromTable(markdown);
  if (tableHotspots.length > 0) {
    return tableHotspots;
  }
  
  // Fall back to list format
  return extractHotspotsFromList(markdown);
}

/**
 * Extract hotspots from markdown table
 * 
 * Expected format:
 * | Rank | Function | Self% | Cum% | Location |
 * |------|----------|-------|------|----------|
 * | 1 | `JSON.parse` | 23.4% | 23.4% | `<native>` |
 */
function extractHotspotsFromTable(markdown: string): Hotspot[] {
  const hotspots: Hotspot[] = [];
  
  // Find hotspots section
  const hotspotsSection = extractSection(markdown, /##?\s*(?:Top\s+)?Hotspots?/i);
  if (!hotspotsSection) {
    return hotspots;
  }
  
  // Match table rows
  const tableRowPattern = /\|\s*(\d+)\s*\|\s*`?([^|`]+)`?\s*\|\s*([\d.]+)%?\s*\|\s*([\d.]+)%?\s*\|\s*`?([^|`]*)`?\s*\|/g;
  
  let match;
  while ((match = tableRowPattern.exec(hotspotsSection)) !== null) {
    const [, rank, func, selfPct, cumPct, location] = match;
    
    hotspots.push({
      rank: parseInt(rank, 10),
      function: func.trim(),
      selfPct: parseFloat(selfPct),
      cumPct: parseFloat(cumPct),
      location: location?.trim() || undefined,
    });
  }
  
  return hotspots;
}

/**
 * Extract hotspots from markdown list
 * 
 * Expected format:
 * 1. `JSON.parse` (**23.4%**) → [Details](#json-parse)
 * 2. `processRequest` (**15.2%**) → [Details](#processrequest)
 */
function extractHotspotsFromList(markdown: string): Hotspot[] {
  const hotspots: Hotspot[] = [];
  
  // Find hotspots section
  const hotspotsSection = extractSection(markdown, /##?\s*(?:Top\s+)?Hotspots?/i);
  if (!hotspotsSection) {
    return hotspots;
  }
  
  // Match list items with various formats
  const listPatterns = [
    // Format: 1. `func` (**23.4%**) → [Details](#anchor)
    /(\d+)\.\s*`([^`]+)`\s*\(\*?\*?([\d.]+)%?\*?\*?\)/g,
    // Format: 1. func (23.4%) - location
    /(\d+)\.\s*([^\(]+)\s*\(([\d.]+)%?\)/g,
    // Format: - **func** - 23.4%
    /-\s*\*\*([^*]+)\*\*\s*-?\s*([\d.]+)%/g,
  ];
  
  for (const pattern of listPatterns) {
    let match;
    while ((match = pattern.exec(hotspotsSection)) !== null) {
      if (pattern.source.startsWith("(\\d+)")) {
        const [, rank, func, pct] = match;
        hotspots.push({
          rank: parseInt(rank, 10),
          function: func.trim(),
          selfPct: parseFloat(pct),
        });
      } else {
        const [, func, pct] = match;
        hotspots.push({
          rank: hotspots.length + 1,
          function: func.trim(),
          selfPct: parseFloat(pct),
        });
      }
    }
    
    if (hotspots.length > 0) break;
  }
  
  return hotspots;
}

/**
 * Extract a section from markdown by heading pattern
 */
function extractSection(markdown: string, headingPattern: RegExp): string | null {
  const lines = markdown.split("\n");
  let inSection = false;
  let sectionLines: string[] = [];
  let sectionLevel = 0;
  
  for (const line of lines) {
    // Check for section start
    if (!inSection && headingPattern.test(line)) {
      inSection = true;
      sectionLevel = (line.match(/^#+/) || [""])[0].length;
      sectionLines.push(line);
      continue;
    }
    
    // Check for section end (next heading of same or higher level)
    if (inSection) {
      const headingMatch = line.match(/^(#+)\s/);
      if (headingMatch && headingMatch[1].length <= sectionLevel) {
        break;
      }
      sectionLines.push(line);
    }
  }
  
  return sectionLines.length > 0 ? sectionLines.join("\n") : null;
}

/**
 * Extract call path for a function from detailed section
 */
export function extractCallPath(
  markdown: string,
  functionName: string
): string[] | undefined {
  // Look for call path in function details section
  // Format: **Call path:** `handleHTTP` → `processRequest` → `parseBody` → `JSON.parse`
  const escapedName = escapeRegex(functionName);
  const section = extractSection(
    markdown,
    new RegExp(`###?\\s*\`?${escapedName}\`?`, "i")
  );
  
  if (!section) return undefined;
  
  const normalized = section.replace(/\*\*/g, "");
  const pathMatch = normalized.match(/Call path:\s*([^\n]+)/i);
  if (!pathMatch) return undefined;
  
  // Parse path (split by → or ->)
  const path = pathMatch[1]
    .split(/\s*(?:→|->)\s*/)
    .map((p) => p.replace(/`/g, "").trim())
    .filter(Boolean);
  
  return path.length > 0 ? path : undefined;
}

/**
 * Extract callers of a function
 */
export function extractCallers(
  markdown: string,
  functionName: string
): string[] | undefined {
  const escapedName = escapeRegex(functionName);
  const section = extractSection(
    markdown,
    new RegExp(`###?\\s*\`?${escapedName}\`?`, "i")
  );
  
  if (!section) return undefined;
  
  const normalized = section.replace(/\*\*/g, "");
  const callersMatch = normalized.match(/Callers?:\s*([^\n]+)/i);
  if (!callersMatch) return undefined;
  
  const callers = callersMatch[1]
    .split(/[,;]/)
    .map((c) => c.replace(/`/g, "").trim())
    .filter(Boolean);
  
  return callers.length > 0 ? callers : undefined;
}

/**
 * Extract callees of a function
 */
export function extractCallees(
  markdown: string,
  functionName: string
): string[] | undefined {
  const escapedName = escapeRegex(functionName);
  const section = extractSection(
    markdown,
    new RegExp(`###?\\s*\`?${escapedName}\`?`, "i")
  );
  
  if (!section) return undefined;
  
  const normalized = section.replace(/\*\*/g, "");
  const calleesMatch = normalized.match(/Callees?:\s*([^\n]+)/i);
  if (!calleesMatch) return undefined;
  
  const callees = calleesMatch[1]
    .split(/[,;]/)
    .map((c) => c.replace(/`/g, "").trim())
    .filter(Boolean);
  
  return callees.length > 0 ? callees : undefined;
}

/**
 * Enrich hotspots with additional context from markdown
 */
export function enrichHotspots(
  hotspots: Hotspot[],
  markdown: string
): Hotspot[] {
  return hotspots.map((hotspot) => ({
    ...hotspot,
    callPath: hotspot.callPath || extractCallPath(markdown, hotspot.function),
    callers: hotspot.callers || extractCallers(markdown, hotspot.function),
    callees: hotspot.callees || extractCallees(markdown, hotspot.function),
  }));
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
