/**
 * Tests for CLI init helpers
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  isReservedCursorDir,
  parseSkillFrontmatterName,
  resolveInstallTarget,
  runInit,
} from "../src/cli/init.js";

describe("cli init helpers", () => {
  it("parseSkillFrontmatterName extracts name", () => {
    const markdown = [
      "---",
      "name: perf-skill",
      "description: test",
      "---",
      "",
      "# Title",
    ].join("\n");

    assert.strictEqual(parseSkillFrontmatterName(markdown), "perf-skill");
  });

  it("resolveInstallTarget handles flat directory", () => {
    const cwd = "/work";
    const homeDir = "/home/user";
    const target = resolve(join(tmpdir(), "perf-skill"));

    const result = resolveInstallTarget({
      target,
      cursor: false,
      scope: undefined,
      name: "perf-skill",
      cwd,
      homeDir,
    });

    assert.strictEqual(result.layout, "flat");
    assert.strictEqual(result.destFile, join(target, "SKILL.md"));
  });

  it("resolveInstallTarget handles cursor user scope default", () => {
    const cwd = "/work";
    const homeDir = "/home/user";

    const result = resolveInstallTarget({
      target: undefined,
      cursor: true,
      scope: "user",
      name: "perf-skill",
      cwd,
      homeDir,
    });

    assert.strictEqual(result.layout, "cursor");
    assert.strictEqual(
      result.destFile,
      join(homeDir, ".cursor", "skills", "perf-skill", "SKILL.md")
    );
  });

  it("resolveInstallTarget handles cursor skills root target", () => {
    const cwd = "/work";
    const homeDir = "/home/user";
    const skillsRoot = resolve(join(tmpdir(), "skills"));

    const result = resolveInstallTarget({
      target: skillsRoot,
      cursor: true,
      scope: "user",
      name: "perf-skill",
      cwd,
      homeDir,
    });

    assert.strictEqual(result.destDir, join(skillsRoot, "perf-skill"));
    assert.strictEqual(result.destFile, join(skillsRoot, "perf-skill", "SKILL.md"));
  });

  it("isReservedCursorDir flags skills-cursor", () => {
    assert.strictEqual(isReservedCursorDir(join("a", "skills-cursor")), true);
    assert.strictEqual(isReservedCursorDir(join("a", "skills")), false);
  });
});

describe("runInit", () => {
  it("writes SKILL.md to target directory", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "perf-skill-init-"));
    try {
      const result = await runInit({ target: tempDir });
      const contents = await readFile(result.destFile, "utf-8");
      assert.ok(contents.includes("name: perf-skill"));
      await stat(result.destFile);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
