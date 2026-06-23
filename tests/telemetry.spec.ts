import { expect, test } from "@playwright/test";
import { shutdownTelemetry, withSpan } from "../agent/telemetry";

test("OpenTelemetry disabled by default does not change return behavior", async () => {
  const result = await withSpan("unit.disabled", { secret: "Bearer abcdefghijklmnopqrstuvwxyz123456" }, async () => "ok");

  expect(result).toBe("ok");
});

test("OpenTelemetry console exporter emits spans without raw secrets", async () => {
  const originalEnabled = process.env.OTEL_ENABLED;
  const originalExporter = process.env.OTEL_TRACES_EXPORTER;
  const output: string[] = [];
  const originalDir = console.dir;
  console.dir = (value?: unknown) => {
    output.push(JSON.stringify(value));
  };

  process.env.OTEL_ENABLED = "true";
  process.env.OTEL_TRACES_EXPORTER = "console";

  try {
    await withSpan("unit.console", { secret: "Bearer abcdefghijklmnopqrstuvwxyz123456", ticket: "SCRUM-4" }, async () => "ok");
    await shutdownTelemetry();
  } finally {
    console.dir = originalDir;
    if (originalEnabled === undefined) delete process.env.OTEL_ENABLED;
    else process.env.OTEL_ENABLED = originalEnabled;
    if (originalExporter === undefined) delete process.env.OTEL_TRACES_EXPORTER;
    else process.env.OTEL_TRACES_EXPORTER = originalExporter;
  }

  const text = output.join("\n");
  expect(text).toContain("unit.console");
  expect(text).toContain("[REDACTED]");
  expect(text).not.toContain("abcdefghijklmnopqrstuvwxyz123456");
});
