export type GuardResult = {
  ok: boolean;
  reason?: string;
};

import ts from "typescript";

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
  [/locator\s*\(\s*["']text=/i, "Generated tests must not use the text= selector engine through locator()."],
  [/\bxpath\s*=|locator\s*\(\s*["']xpath=/i, "Generated tests must not use XPath."],
];

const bannedIdentifiers = new Set([
  "eval",
  "Function",
  "global",
  "globalThis",
  "process",
  "require",
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
]);

const bannedMethods = new Set([
  "addCookies",
  "check",
  "click",
  "dblclick",
  "dispatchEvent",
  "dragTo",
  "evaluate",
  "evaluateAll",
  "evaluateHandle",
  "fill",
  "focus",
  "goBack",
  "goForward",
  "keyboard",
  "mouse",
  "press",
  "request",
  "route",
  "selectOption",
  "setExtraHTTPHeaders",
  "setInputFiles",
  "uncheck",
]);

function stringArg(argument: ts.Expression | undefined) {
  return argument && ts.isStringLiteralLike(argument) ? argument.text.trim() : undefined;
}

function optionString(call: ts.CallExpression, optionName: string) {
  const options = call.arguments[1];
  if (!options || !ts.isObjectLiteralExpression(options)) return undefined;

  for (const property of options.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const name = property.name;
    const key = ts.isIdentifier(name) || ts.isStringLiteralLike(name) ? name.text : undefined;
    if (key === optionName && ts.isStringLiteralLike(property.initializer)) return property.initializer.text.trim();
  }

  return undefined;
}

function isShortCommonLabel(value: string | undefined) {
  return Boolean(value && value.length <= 3);
}

function isDisallowedExternalUrl(value: string | undefined, targetUrl?: string) {
  if (!value || !/^https?:\/\//i.test(value) || !targetUrl) return false;
  try {
    return new URL(value).origin !== new URL(targetUrl).origin;
  } catch {
    return true;
  }
}

function validateAst(code: string, targetUrl?: string): GuardResult {
  const source = ts.createSourceFile("generated.spec.ts", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const diagnostics = (source as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? [];
  if (diagnostics.length > 0) {
    return { ok: false, reason: "Generated test must be valid TypeScript." };
  }

  let failure: GuardResult | undefined;
  const fail = (reason: string) => {
    failure ??= { ok: false, reason };
  };

  const visit = (node: ts.Node) => {
    if (failure) return;

    if (ts.isImportDeclaration(node)) {
      const moduleName = node.moduleSpecifier;
      if (!ts.isStringLiteral(moduleName) || moduleName.text !== "@playwright/test") {
        fail("Generated tests may only import from @playwright/test.");
        return;
      }
    }

    if (ts.isExportDeclaration(node) || ts.isExportAssignment(node)) {
      fail("Generated tests must not export code.");
      return;
    }

    if (node.kind === ts.SyntaxKind.ImportKeyword) {
      fail("Generated tests must not use dynamic import().");
      return;
    }

    if (ts.isIdentifier(node) && bannedIdentifiers.has(node.text)) {
      fail(`Generated tests must not reference ${node.text}.`);
      return;
    }

    if (ts.isPropertyAccessExpression(node) && bannedMethods.has(node.name.text)) {
      fail(`Generated tests must not use ${node.name.text}().`);
      return;
    }

    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      if (method === "getByText" && isShortCommonLabel(stringArg(node.arguments[0]))) {
        fail("Generated tests must not use unscoped short text locators; use a stable CSS/href selector or a unique accessible label.");
        return;
      }
      if (method === "getByRole" && isShortCommonLabel(optionString(node, "name"))) {
        fail("Generated tests must not use unscoped short role locators; use a stable CSS/href selector or a unique accessible label.");
        return;
      }
      if (method === "goto" && isDisallowedExternalUrl(stringArg(node.arguments[0]), targetUrl)) {
        fail("Generated tests must not navigate to external origins outside TARGET_URL.");
        return;
      }
    }

    if (ts.isElementAccessExpression(node)) {
      fail("Generated tests must not use dynamic property access.");
      return;
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
  return failure ?? { ok: true };
}

export function validate(code: string, options: { targetUrl?: string } = {}): GuardResult {
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

  return validateAst(trimmed, options.targetUrl);
}
