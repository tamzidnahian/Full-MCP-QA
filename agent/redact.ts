const secretLikePatterns = [
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  /\b(?:xox[baprs]-)[A-Za-z0-9-]{10,}\b/g,
  /\b(?:ghp|github_pat|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g,
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi,
  /\bBasic\s+[A-Za-z0-9+/]+=*/gi,
  /\b[A-Za-z0-9+/]{32,}={0,2}\b/g,
];

export function redact(value: unknown, maxLength?: number) {
  let text = String(value ?? "");
  for (const pattern of secretLikePatterns) {
    text = text.replace(pattern, "[REDACTED]");
  }
  return typeof maxLength === "number" ? text.slice(0, maxLength) : text;
}

export function redactRecord<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, typeof value === "string" ? redact(value) : value]),
  ) as T;
}
