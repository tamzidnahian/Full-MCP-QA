export type GuardResult = {
  ok: boolean;
  reason?: string;
};

const bannedPatterns: Array<[RegExp, string]> = [
  [/```/, "Output must not include markdown fences."],
  [/\bprocess\s*\.\s*env\b/, "Generated tests must not reference process.env."],
  [/\bfrom\s+["']fs["']|\brequire\s*\(\s*["']fs["']\s*\)/, "Generated tests must not import fs."],
  [
    /\bfrom\s+["']child_process["']|\brequire\s*\(\s*["']child_process["']\s*\)/,
    "Generated tests must not import child_process.",
  ],
  [/\btest\s*\.\s*(skip|fixme|only)\s*\(/, "Generated tests must not use test.skip, test.fixme, or test.only."],
  [/waitForTimeout\s*\(/, "Generated tests must not use waitForTimeout."],
  [/\bxpath\s*=|locator\s*\(\s*["']xpath=/i, "Generated tests must not use XPath."],
];

export function validate(code: string): GuardResult {
  const trimmed = code.trim();

  if (!trimmed) return { ok: false, reason: "Output is empty." };

  if (!/import\s+\{[^}]*\btest\b[^}]*\bexpect\b[^}]*\}\s+from\s+["']@playwright\/test["'];?/.test(trimmed)) {
    return { ok: false, reason: "Output must import test and expect from @playwright/test." };
  }

  if (!/\bexpect\s*\(/.test(trimmed)) {
    return { ok: false, reason: "Output must contain at least one expect()." };
  }

  for (const [pattern, reason] of bannedPatterns) {
    if (pattern.test(trimmed)) return { ok: false, reason };
  }

  return { ok: true };
}
