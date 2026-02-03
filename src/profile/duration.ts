export function parseDurationMs(
  value: string | number | undefined,
  fallbackMs: number
): number {
  if (value === undefined || value === "") {
    return fallbackMs;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`Invalid duration: ${value}`);
    }
    return Math.round(value);
  }

  const trimmed = value.trim().toLowerCase();
  const match = trimmed.match(/^(\d+(?:\.\d+)?)(ms|s|m)?$/);
  if (!match) {
    throw new Error(`Invalid duration: ${value}`);
  }

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Invalid duration: ${value}`);
  }

  const unit = match[2] ?? "ms";
  const multiplier = unit === "ms" ? 1 : unit === "s" ? 1000 : 60000;
  return Math.round(amount * multiplier);
}
