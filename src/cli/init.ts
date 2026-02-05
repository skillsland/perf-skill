/**
 * CLI init command helpers - install SKILL.md into target directories for multiple AI platforms
 */

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type AIPlatform,
  AI_PLATFORMS,
  PLATFORM_CONFIGS,
  getAllPlatforms,
  isPlatformValid,
} from "./platforms.js";
import { renderSkillForPlatform, getDestinationPath } from "./template.js";

export type CursorScope = "user" | "project";

export interface InitOptions {
  target?: string;
  cursor?: boolean;
  platform?: AIPlatform;
  scope?: CursorScope;
  force?: boolean;
  dryRun?: boolean;
  offline?: boolean;
}

export interface InstallTarget {
  platform: string;
  layout: "cursor" | "flat" | "file" | "platform";
  rootDir: string;
  destDir: string;
  destFile: string;
}

export interface InitResult {
  success: boolean;
  targets: InstallTarget[];
  errors: Array<{ platform: string; error: string }>;
}

function normalizeFrontmatterValue(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export function parseSkillFrontmatterName(markdown: string): string | null {
  const trimmed = markdown.trimStart();
  if (!trimmed.startsWith("---")) return null;
  const lines = trimmed.split(/\r?\n/);
  if (lines.length < 2 || lines[0].trim() !== "---") return null;
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line === "---") break;
    const match = line.match(/^name:\s*(.+)$/);
    if (match?.[1]) {
      return normalizeFrontmatterValue(match[1]);
    }
  }
  return null;
}

function isMarkdownFile(targetPath: string): boolean {
  return extname(targetPath).toLowerCase() === ".md";
}

function looksLikeSkillsRoot(targetPath: string): boolean {
  return basename(targetPath) === "skills";
}

export function isReservedCursorDir(targetPath: string): boolean {
  return targetPath.split(sep).includes("skills-cursor");
}

function resolveCursorRoot(scope: CursorScope, cwd: string, homeDir: string): string {
  if (scope === "project") {
    return resolve(cwd, ".cursor", "skills");
  }
  return resolve(homeDir, ".cursor", "skills");
}

export function resolveInstallTarget(options: {
  target?: string;
  cursor?: boolean;
  scope?: CursorScope;
  name: string;
  cwd: string;
  homeDir: string;
}): InstallTarget {
  const target = options.target ? resolve(options.cwd, options.target) : undefined;

  if (options.cursor) {
    const scope = options.scope ?? "user";
    const root = target ?? resolveCursorRoot(scope, options.cwd, options.homeDir);

    if (target && isMarkdownFile(target)) {
      const destDir = dirname(target);
      return {
        platform: "cursor",
        layout: "file",
        rootDir: destDir,
        destDir,
        destFile: target,
      };
    }

    const destDir = target
      ? looksLikeSkillsRoot(target)
        ? join(target, options.name)
        : target
      : join(root, options.name);

    return {
      platform: "cursor",
      layout: "cursor",
      rootDir: root,
      destDir,
      destFile: join(destDir, "SKILL.md"),
    };
  }

  if (!target) {
    throw new Error("Missing target path. Provide a directory or use --cursor.");
  }

  if (isMarkdownFile(target)) {
    const destDir = dirname(target);
    return {
      platform: "custom",
      layout: "file",
      rootDir: destDir,
      destDir,
      destFile: target,
    };
  }

  return {
    platform: "custom",
    layout: "flat",
    rootDir: target,
    destDir: target,
    destFile: join(target, "SKILL.md"),
  };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function getPackageRoot(): string {
  return resolve(fileURLToPath(new URL("../../", import.meta.url)));
}

async function loadSkillSource(): Promise<{ markdown: string; name: string; path: string }> {
  const packageRoot = getPackageRoot();
  const skillPath = resolve(packageRoot, "SKILL.md");
  const markdown = await readFile(skillPath, "utf-8");
  const name = parseSkillFrontmatterName(markdown) ?? "perf-skill";
  return { markdown, name, path: skillPath };
}

/**
 * Install skill for a single platform
 */
async function installForPlatform(
  platform: Exclude<AIPlatform, "all">,
  options: {
    scope: CursorScope;
    force: boolean;
    dryRun: boolean;
    cwd: string;
    homeDir: string;
  }
): Promise<InstallTarget> {
  const config = PLATFORM_CONFIGS[platform];
  const { destDir, destFile } = getDestinationPath(
    config,
    options.cwd,
    options.scope,
    options.homeDir
  );

  const target: InstallTarget = {
    platform,
    layout: "platform",
    rootDir: resolve(options.scope === "project" ? options.cwd : options.homeDir, config.folderStructure.root),
    destDir,
    destFile,
  };

  if (options.dryRun) {
    return target;
  }

  // Check for reserved directories
  if (isReservedCursorDir(destDir) || isReservedCursorDir(destFile)) {
    throw new Error("Refusing to install into Cursor's reserved skills-cursor directory.");
  }

  // Create directory
  await mkdir(destDir, { recursive: true });

  // Check if file exists
  if (!options.force && await fileExists(destFile)) {
    throw new Error(`Skill already exists at ${destFile}. Use --force to overwrite.`);
  }

  // Render and write the skill file
  const content = await renderSkillForPlatform(config);
  await writeFile(destFile, content, "utf-8");

  return target;
}

/**
 * Run init command - supports multiple platforms
 */
export async function runInit(options: InitOptions): Promise<InitResult> {
  const cwd = process.cwd();
  const home = homedir();
  const scope = options.scope ?? "project";
  const force = options.force ?? false;
  const dryRun = options.dryRun ?? false;

  // Legacy --cursor flag support (maps to cursor platform)
  if (options.cursor && !options.platform) {
    options.platform = "cursor";
  }

  // If platform specified
  if (options.platform) {
    if (!isPlatformValid(options.platform)) {
      return {
        success: false,
        targets: [],
        errors: [{ platform: options.platform, error: `Invalid platform: ${options.platform}. Valid: ${AI_PLATFORMS.join(", ")}` }],
      };
    }

    // Handle "all" platform
    if (options.platform === "all") {
      const platforms = getAllPlatforms();
      const targets: InstallTarget[] = [];
      const errors: Array<{ platform: string; error: string }> = [];

      for (const platform of platforms) {
        try {
          const target = await installForPlatform(platform, { scope, force, dryRun, cwd, homeDir: home });
          targets.push(target);
        } catch (error) {
          errors.push({
            platform,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return {
        success: errors.length === 0,
        targets,
        errors,
      };
    }

    // Single platform
    try {
      const target = await installForPlatform(options.platform, { scope, force, dryRun, cwd, homeDir: home });
      return { success: true, targets: [target], errors: [] };
    } catch (error) {
      return {
        success: false,
        targets: [],
        errors: [{ platform: options.platform, error: error instanceof Error ? error.message : String(error) }],
      };
    }
  }

  // Legacy: no platform specified, use target path or cursor flag
  if (options.scope && !options.cursor && !options.platform) {
    throw new Error("--scope is only supported with --cursor or --platform.");
  }

  const { markdown, name } = await loadSkillSource();

  const target = resolveInstallTarget({
    target: options.target,
    cursor: options.cursor,
    scope: options.scope,
    name,
    cwd,
    homeDir: home,
  });

  if (isReservedCursorDir(target.destDir) || isReservedCursorDir(target.destFile)) {
    throw new Error("Refusing to install into Cursor's reserved skills-cursor directory.");
  }

  if (dryRun) {
    return { success: true, targets: [target], errors: [] };
  }

  await mkdir(target.destDir, { recursive: true });

  if (!force && await fileExists(target.destFile)) {
    throw new Error(`Skill already exists at ${target.destFile}. Use --force to overwrite.`);
  }

  await writeFile(target.destFile, markdown, "utf-8");
  return { success: true, targets: [target], errors: [] };
}

// Re-export types and constants for convenience
export { AI_PLATFORMS, type AIPlatform } from "./platforms.js";
