import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJsonPath = join(__dirname, "..", "package.json");

const { version } = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
const args = process.argv.slice(2);

const result = spawnSync("docker-compose", args, {
  stdio: "inherit",
  env: {
    ...process.env,
    SMRUTI_CORTEX_VERSION: version,
  },
});

process.exit(result.status ?? 1);
