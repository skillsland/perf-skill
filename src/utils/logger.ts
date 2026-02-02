/**
 * Simple structured logger for observability
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  [key: string]: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || "info";

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatLog(entry: LogEntry): string {
  if (process.env.LOG_FORMAT === "json") {
    return JSON.stringify(entry);
  }
  
  const { level, message, timestamp, ...rest } = entry;
  const extras = Object.keys(rest).length > 0 
    ? ` ${JSON.stringify(rest)}` 
    : "";
  return `[${timestamp}] ${level.toUpperCase()}: ${message}${extras}`;
}

function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;
  
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...meta,
  };
  
  const output = formatLog(entry);
  
  if (level === "error") {
    console.error(output);
  } else if (level === "warn") {
    console.warn(output);
  } else {
    console.log(output);
  }
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => log("debug", message, meta),
  info: (message: string, meta?: Record<string, unknown>) => log("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => log("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => log("error", message, meta),
  
  /** Log with timing measurement */
  time: <T>(label: string, fn: () => T): T => {
    const start = performance.now();
    try {
      const result = fn();
      if (result instanceof Promise) {
        return result.then((r) => {
          log("debug", `${label} completed`, { durationMs: Math.round(performance.now() - start) });
          return r;
        }).catch((e) => {
          log("error", `${label} failed`, { durationMs: Math.round(performance.now() - start), error: String(e) });
          throw e;
        }) as T;
      }
      log("debug", `${label} completed`, { durationMs: Math.round(performance.now() - start) });
      return result;
    } catch (e) {
      log("error", `${label} failed`, { durationMs: Math.round(performance.now() - start), error: String(e) });
      throw e;
    }
  },
  
  /** Create a child logger with default metadata */
  child: (defaultMeta: Record<string, unknown>) => ({
    debug: (message: string, meta?: Record<string, unknown>) => 
      log("debug", message, { ...defaultMeta, ...meta }),
    info: (message: string, meta?: Record<string, unknown>) => 
      log("info", message, { ...defaultMeta, ...meta }),
    warn: (message: string, meta?: Record<string, unknown>) => 
      log("warn", message, { ...defaultMeta, ...meta }),
    error: (message: string, meta?: Record<string, unknown>) => 
      log("error", message, { ...defaultMeta, ...meta }),
  }),
};
