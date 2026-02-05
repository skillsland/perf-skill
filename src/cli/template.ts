/**
 * Template engine for generating platform-specific skill files
 */

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { PlatformConfig } from "./platforms.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get the package root directory
 */
function getPackageRoot(): string {
  return resolve(__dirname, "..", "..");
}

/**
 * Load the base SKILL.md content
 */
async function loadBaseSkillContent(): Promise<string> {
  const packageRoot = getPackageRoot();
  const skillPath = resolve(packageRoot, "SKILL.md");
  return readFile(skillPath, "utf-8");
}

/**
 * Parse frontmatter from markdown content
 */
function parseFrontmatter(content: string): {
  frontmatter: Record<string, string>;
  body: string;
} {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("---")) {
    return { frontmatter: {}, body: content };
  }

  const lines = trimmed.split(/\r?\n/);
  const frontmatterLines: string[] = [];
  let bodyStartIndex = 1;

  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      bodyStartIndex = i + 1;
      break;
    }
    frontmatterLines.push(lines[i]);
  }

  const frontmatter: Record<string, string> = {};
  for (const line of frontmatterLines) {
    const match = line.match(/^(\w[\w-]*):\s*(.+)$/);
    if (match) {
      const key = match[1];
      let value = match[2].trim();
      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      frontmatter[key] = value;
    }
  }

  const body = lines.slice(bodyStartIndex).join("\n");
  return { frontmatter, body };
}

/**
 * Build frontmatter string from object
 */
function buildFrontmatter(frontmatter: Record<string, string>): string {
  const lines = ["---"];
  for (const [key, value] of Object.entries(frontmatter)) {
    // Quote values that contain special characters
    if (value.includes(":") || value.includes("#") || value.includes("\n")) {
      lines.push(`${key}: "${value.replace(/"/g, '\\"')}"`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}

/**
 * Generate quick reference section for Claude
 */
function generateQuickReference(): string {
  return `
## Quick Reference

### Common Commands

| Command | Description |
|---------|-------------|
| \`npx perf-skill analyze profile.pb.gz\` | Analyze a profile |
| \`npx perf-skill diff base.pb.gz current.pb.gz\` | Compare two profiles |
| \`npx perf-skill run app.js --duration 10s\` | Profile and analyze a Node.js app |
| \`npx perf-skill convert profile.pb.gz -o report.md\` | Convert profile to markdown |

### Understanding Results

- **selfPct**: Time spent in this function only (high = expensive work)
- **cumPct**: Time including callees (high = hot path entry point)
- **callPath**: Call stack from root to this function

### Common Patterns

| Pattern | Meaning | Action |
|---------|---------|--------|
| High self% on JSON.parse | JSON parsing bottleneck | Consider streaming parser |
| High cum% with low self% | Function calls expensive code | Trace callees |
| Native function at top | V8/libuv bottleneck | Consider alternative APIs |
`;
}

/**
 * Render a skill file for a specific platform
 */
export async function renderSkillForPlatform(config: PlatformConfig): Promise<string> {
  const baseContent = await loadBaseSkillContent();
  const { frontmatter: baseFrontmatter, body } = parseFrontmatter(baseContent);

  // Build the new frontmatter
  const newFrontmatter: Record<string, string> = {
    name: "perf-skill",
    description: config.description,
  };

  // Keep allowed-tools and argument-hint from base
  if (baseFrontmatter["allowed-tools"]) {
    newFrontmatter["allowed-tools"] = baseFrontmatter["allowed-tools"];
  }
  if (baseFrontmatter["argument-hint"]) {
    newFrontmatter["argument-hint"] = baseFrontmatter["argument-hint"];
  }

  // Merge platform-specific frontmatter
  if (config.frontmatter) {
    Object.assign(newFrontmatter, config.frontmatter);
  }

  // Build the content
  let content = buildFrontmatter(newFrontmatter) + "\n" + body;

  // Add quick reference section for Claude
  if (config.sections.quickReference) {
    // Insert quick reference after the first heading
    const headingMatch = content.match(/^(#[^#].*\n)/m);
    if (headingMatch) {
      const insertPoint = content.indexOf(headingMatch[0]) + headingMatch[0].length;
      content = content.slice(0, insertPoint) + generateQuickReference() + "\n" + content.slice(insertPoint);
    }
  }

  return content;
}

/**
 * Get the destination path for a platform installation
 */
export function getDestinationPath(
  config: PlatformConfig,
  projectRoot: string,
  scope: "user" | "project",
  homeDir: string
): { destDir: string; destFile: string } {
  const { folderStructure } = config;
  
  let rootDir: string;
  if (scope === "project") {
    rootDir = resolve(projectRoot, folderStructure.root);
  } else {
    rootDir = resolve(homeDir, folderStructure.root);
  }

  const destDir = resolve(rootDir, folderStructure.skillPath);
  const destFile = resolve(destDir, folderStructure.filename);

  return { destDir, destFile };
}
