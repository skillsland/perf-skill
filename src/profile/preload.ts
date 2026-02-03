import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseDurationMs } from "./duration.js";

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

const durationMs = parseDurationMs(
  process.env.PERF_SKILL_DURATION_MS,
  10_000
);
const profileOut = resolve(process.env.PERF_SKILL_PROFILE_OUT ?? "cpu.pb.gz");
const profileType = process.env.PERF_SKILL_PROFILE_TYPE ?? "cpu";
const logEnabled = process.env.PERF_SKILL_PROFILE_LOG !== "0";
const heapEnabled = process.env.PERF_SKILL_ENABLE_HEAP === "1";
const heapOut = resolve(process.env.PERF_SKILL_HEAP_OUT ?? "heap.pb.gz");
const heapIntervalBytes = parsePositiveInt(process.env.PERF_SKILL_HEAP_INTERVAL_BYTES, 512 * 1024);
const heapStackDepth = parsePositiveInt(process.env.PERF_SKILL_HEAP_STACK_DEPTH, 64);

let pprof: typeof import("@datadog/pprof");
try {
  pprof = await import("@datadog/pprof");
} catch (error) {
  console.error(
    "[perf-skill] Failed to load @datadog/pprof. " +
      "Ensure the package is installed and supported on this platform."
  );
  if (error instanceof Error) {
    console.error(`[perf-skill] ${error.message}`);
  }
  process.exit(1);
}

if (profileType !== "cpu" && logEnabled) {
  console.error(`[perf-skill] Unsupported profile type: ${profileType}. Using cpu.`);
}

let stopped = false;
let heapStarted = false;

function stopAndWrite(reason: string): void {
  if (stopped) return;
  stopped = true;

  try {
    const profile = pprof.time.stop();
    const buf = pprof.encodeSync(profile);
    mkdirSync(dirname(profileOut), { recursive: true });
    writeFileSync(profileOut, buf);
    if (logEnabled) {
      console.error(`[perf-skill] Wrote CPU profile (${reason}) to ${profileOut}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[perf-skill] Failed to write profile: ${message}`);
  }

  if (heapEnabled && heapStarted) {
    try {
      const heapProfile = pprof.heap.profile();
      const buf = pprof.encodeSync(heapProfile);
      mkdirSync(dirname(heapOut), { recursive: true });
      writeFileSync(heapOut, buf);
      if (logEnabled) {
        console.error(`[perf-skill] Wrote heap profile (${reason}) to ${heapOut}`);
      }
      pprof.heap.stop();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[perf-skill] Failed to write heap profile: ${message}`);
    }
  }
}

try {
  pprof.time.start({});
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[perf-skill] Failed to start profiler: ${message}`);
  process.exit(1);
}

if (heapEnabled) {
  try {
    pprof.heap.start(heapIntervalBytes, heapStackDepth);
    heapStarted = true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[perf-skill] Failed to start heap profiler: ${message}`);
  }
}

const timer = setTimeout(() => stopAndWrite("duration"), durationMs);
timer.unref();

process.once("beforeExit", () => stopAndWrite("beforeExit"));
process.once("SIGINT", () => {
  stopAndWrite("SIGINT");
  process.exit(130);
});
process.once("SIGTERM", () => {
  stopAndWrite("SIGTERM");
  process.exit(143);
});
