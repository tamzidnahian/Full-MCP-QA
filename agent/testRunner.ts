import { execFileSync } from "child_process";
import { mkdirSync } from "fs";
import { requiredEnv } from "./env";
import { redact } from "./redact";
import { withSpan } from "./telemetry";

export type TestRunInput = {
  testFile: string;
  testPath: string;
  ticketKey: string;
};

export type TestRunResult = {
  passed: boolean;
  failureLog: string;
  runner: string;
};

function npxBin() {
  return process.platform === "win32" ? "cmd.exe" : "npx";
}

function playwrightArgs(testFile: string) {
  const args = ["playwright", "test", testFile];
  return process.platform === "win32" ? ["/c", "npx.cmd", ...args] : args;
}

export function buildSafePlaywrightEnv(): NodeJS.ProcessEnv {
  const keep = [
    "AGENT_ALLOWED_ORIGIN",
    "CI",
    "ComSpec",
    "HOME",
    "LOCALAPPDATA",
    "NODE",
    "NODE_ENV",
    "PATH",
    "PATHEXT",
    "Path",
    "PLAYWRIGHT_BROWSERS_PATH",
    "SystemRoot",
    "TARGET_URL",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "WINDIR",
  ];
  const env = Object.fromEntries(
    keep.map((key) => [key, process.env[key]]).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  env.AGENT_ALLOWED_ORIGIN = new URL(requiredEnv("TARGET_URL")).origin;
  return env;
}

function dockerBin() {
  return process.platform === "win32" ? "docker.exe" : "docker";
}

function runProcess(input: TestRunInput): TestRunResult {
  try {
    execFileSync(npxBin(), playwrightArgs(input.testFile), {
      env: buildSafePlaywrightEnv(),
      stdio: "pipe",
    });
    return { passed: true, failureLog: "", runner: "process" };
  } catch (error: any) {
    return {
      passed: false,
      failureLog: redact(error.stdout ?? error.stderr ?? error, 1500),
      runner: "process",
    };
  }
}

function runDocker(input: TestRunInput): TestRunResult {
  mkdirSync("playwright-report", { recursive: true });
  mkdirSync("test-results", { recursive: true });
  try {
    execFileSync(
      dockerBin(),
      [
        "run",
        "--rm",
        "--network",
        process.env.AGENT_DOCKER_NETWORK || "bridge",
        "-e",
        `TARGET_URL=${requiredEnv("TARGET_URL")}`,
        "-e",
        `AGENT_ALLOWED_ORIGIN=${new URL(requiredEnv("TARGET_URL")).origin}`,
        "-v",
        `${process.cwd()}:/work`,
        "-w",
        "/work",
        process.env.AGENT_PLAYWRIGHT_DOCKER_IMAGE || "mcr.microsoft.com/playwright:v1.56.1-noble",
        "npx",
        "playwright",
        "test",
        input.testFile,
      ],
      { stdio: "pipe" },
    );
    return { passed: true, failureLog: "", runner: "docker" };
  } catch (error: any) {
    return {
      passed: false,
      failureLog: redact(error.stdout ?? error.stderr ?? error, 1500),
      runner: "docker",
    };
  }
}

export async function runGeneratedTest(input: TestRunInput) {
  return withSpan(
    "qa.playwright.run",
    {
      "ticket.key": input.ticketKey,
      "test.path": input.testPath,
      "qa.runner": process.env.AGENT_TEST_RUNNER || "process",
    },
    async () => {
      if (process.env.AGENT_TEST_RUNNER === "docker") return runDocker(input);
      return runProcess(input);
    },
  );
}
