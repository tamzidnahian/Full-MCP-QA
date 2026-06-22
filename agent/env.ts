import { existsSync, readFileSync } from "fs";

export function loadEnv(path = ".env") {
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;

    const [, key, value] = match;
    if (!process.env[key]) {
      process.env[key] = value.replace(/^["']|["']$/g, "");
    }
  }
}

export function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
