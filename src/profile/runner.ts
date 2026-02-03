import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseDurationMs } from "./duration.js";

export interface RunProfileOptions {
  entryPath: string;
  entryArgs?: string[];
  durationMs?: number;
  outPath?: string;
  enableHeap?: boolean;
  heapOutPath?: string;
  heapIntervalBytes?: number;
  heapStackDepth?: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

const require = createRequire(import.meta.url);

function hasTsx(): boolean {
  try {
    require.resolve("tsx");
    return true;
  } catch {
    return false;
  }
}

export function resolvePreloadPath(): { preloadPath: string; needsTsx: boolean } {
  const jsPath = fileURLToPath(new URL("./preload.js", import.meta.url));
  if (existsSync(jsPath)) {
    return { preloadPath: jsPath, needsTsx: false };
  }

  const tsPath = fileURLToPath(new URL("./preload.ts", import.meta.url));
  if (existsSync(tsPath)) {
    return { preloadPath: tsPath, needsTsx: true };
  }

  throw new Error("Unable to locate perf-skill profile preload module.");
}

function entryNeedsTsx(entryPath: string): boolean {
  const ext = extname(entryPath).toLowerCase();
  return ext === ".ts" || ext === ".tsx";
}

export async function runCpuProfile(
  options: RunProfileOptions
): Promise<{ profilePath: string; heapProfilePath?: string }> {
  const durationMs = options.durationMs ?? 10_000;
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new Error("Invalid duration for profiling.");
  }

  const entryPath = resolve(options.entryPath);
  const profilePath = resolve(options.outPath ?? "cpu.pb.gz");
  const heapEnabled = options.enableHeap === true;
  const heapProfilePath = heapEnabled
    ? resolve(options.heapOutPath ?? "heap.pb.gz")
    : undefined;
  const { preloadPath, needsTsx: preloadNeedsTsx } = resolvePreloadPath();
  const entryUsesTsx = entryNeedsTsx(entryPath);
  const needsTsx = preloadNeedsTsx || entryUsesTsx;

  if (needsTsx && !hasTsx()) {
    throw new Error("TypeScript entry requires the tsx package to be installed.");
  }

  const nodeArgs: string[] = [];
  if (needsTsx) {
    nodeArgs.push("--import", "tsx");
  }
  nodeArgs.push("--import", pathToFileURL(preloadPath).href, entryPath, ...(options.entryArgs ?? []));

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...options.env,
    PERF_SKILL_DURATION_MS: String(durationMs),
    PERF_SKILL_PROFILE_OUT: profilePath,
    PERF_SKILL_PROFILE_TYPE: "cpu",
    PERF_SKILL_ENABLE_HEAP: heapEnabled ? "1" : "0",
  };

  if (heapEnabled && heapProfilePath) {
    env.PERF_SKILL_HEAP_OUT = heapProfilePath;
    if (options.heapIntervalBytes !== undefined) {
      env.PERF_SKILL_HEAP_INTERVAL_BYTES = String(options.heapIntervalBytes);
    }
    if (options.heapStackDepth !== undefined) {
      env.PERF_SKILL_HEAP_STACK_DEPTH = String(options.heapStackDepth);
    }
  }

  const exitCode = await new Promise<number>((resolvePromise, reject) => {
    const child = spawn(process.execPath, nodeArgs, {
      stdio: "inherit",
      cwd: options.cwd ?? process.cwd(),
      env,
    });

    child.on("error", reject);
    child.on("exit", (code) => resolvePromise(code ?? 1));
  });

  if (exitCode !== 0) {
    throw new Error(`Profile run failed with exit code ${exitCode}.`);
  }

  return { profilePath, heapProfilePath };
}

export function parseDurationInput(value: string | undefined): number {
  return parseDurationMs(value, 10_000);
}
