/**
 * CLI init command helpers - install SKILL.md into a target directory
 */

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export type CursorScope = "user" | "project";

export interface InitOptions {
  target?: string;
  cursor?: boolean;
  scope?: CursorScope;
  force?: boolean;
  dryRun?: boolean;
}

export interface InstallTarget {
  layout: "cursor" | "flat" | "file";
  rootDir: string;
  destDir: string;
  destFile: string;
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
      layout: "file",
      rootDir: destDir,
      destDir,
      destFile: target,
    };
  }

  return {
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

export async function runInit(options: InitOptions): Promise<InstallTarget> {
  const { markdown, name } = await loadSkillSource();

  if (options.scope && !options.cursor) {
    throw new Error("--scope is only supported with --cursor.");
  }

  const target = resolveInstallTarget({
    target: options.target,
    cursor: options.cursor,
    scope: options.scope,
    name,
    cwd: process.cwd(),
    homeDir: homedir(),
  });

  if (isReservedCursorDir(target.destDir) || isReservedCursorDir(target.destFile)) {
    throw new Error("Refusing to install into Cursor's reserved skills-cursor directory.");
  }

  if (options.dryRun) {
    return target;
  }

  await mkdir(target.destDir, { recursive: true });

  if (!options.force && await fileExists(target.destFile)) {
    throw new Error(`Skill already exists at ${target.destFile}. Use --force to overwrite.`);
  }

  await writeFile(target.destFile, markdown, "utf-8");
  return target;
}
