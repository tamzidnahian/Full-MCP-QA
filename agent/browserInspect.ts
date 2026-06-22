import { loadEnv, requiredEnv } from "./env";
import { inspectTarget } from "./inspectTarget";

loadEnv();

async function main() {
  const url = requiredEnv("TARGET_URL");
  console.log(await inspectTarget(url, 20));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
