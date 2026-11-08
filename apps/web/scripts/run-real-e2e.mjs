import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(webRoot, "../..");
const apiRoot = path.join(repoRoot, "apps", "api");
const python =
  process.env.API_PYTHON ??
  (process.platform === "win32"
    ? path.join(apiRoot, ".venv", "Scripts", "python.exe")
    : path.join(apiRoot, ".venv", "bin", "python"));
const apiPython = existsSync(python) ? python : process.env.API_PYTHON ?? "python";
const jwtSecret = "overcall-local-e2e-jwt-secret-only-not-for-production";
const supabaseUrl = "http://127.0.0.1:54321";
const userId = randomUUID();

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with code ${result.status}.`);
}

async function findFreePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return port;
}

const portSet = new Set();
while (portSet.size < 3) portSet.add(await findFreePort());
const [databasePort, apiPort, webPort] = [...portSet];
const testDatabaseUrl = (
  process.env.TEST_DATABASE_URL ??
  `postgresql://overcall:overcall@127.0.0.1:${databasePort}/overcall`
).replace(/^postgresql\+asyncpg:/, "postgresql:");
const apiDatabaseUrl = testDatabaseUrl.replace(
  /^postgresql(?:\+asyncpg)?:/,
  "postgresql+asyncpg:",
);
const env = {
  ...process.env,
  API_PYTHON: apiPython,
  API_DATABASE_URL: apiDatabaseUrl,
  E2E_API_PORT: String(apiPort),
  E2E_WEB_PORT: String(webPort),
  E2E_TEST_JWT_SECRET: jwtSecret,
  E2E_USER_ID: userId,
  TEST_DATABASE_URL: testDatabaseUrl,
  VITE_SUPABASE_URL: supabaseUrl,
};

let containerName;
try {
  if (!process.env.TEST_DATABASE_URL) {
    containerName = `overcall-real-e2e-${process.pid}-${randomUUID().slice(0, 8)}`;
    run(
      "docker",
      [
        "run",
        "--rm",
        "-d",
        "--name",
        containerName,
        "--health-cmd",
        "pg_isready -U overcall -d overcall",
        "--health-interval",
        "1s",
        "--health-timeout",
        "5s",
        "--health-retries",
        "30",
        "-e",
        "POSTGRES_DB=overcall",
        "-e",
        "POSTGRES_USER=overcall",
        "-e",
        "POSTGRES_PASSWORD=overcall",
        "-p",
        `127.0.0.1:${databasePort}:5432`,
        "postgres:15",
      ],
      { cwd: repoRoot },
    );

    let healthy = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const status = spawnSync("docker", ["inspect", "--format={{.State.Health.Status}}", containerName], {
        encoding: "utf8",
      });
      if (status.stdout.trim() === "healthy") {
        healthy = true;
        break;
      }
      if (status.status !== 0) throw new Error("The isolated PostgreSQL container stopped unexpectedly.");
      await delay(1000);
    }
    if (!healthy) throw new Error("The isolated PostgreSQL container did not become healthy.");
  }

  run(apiPython, ["scripts/init_test_db.py"], {
    cwd: apiRoot,
    env,
  });
  run(apiPython, ["scripts/seed_e2e_user.py"], {
    cwd: apiRoot,
    env,
  });
  run(
    process.execPath,
    ["node_modules/@playwright/test/cli.js", "test", "--config", "playwright.real.config.ts"],
    { cwd: webRoot, env },
  );
} finally {
  if (containerName) {
    const cleanup = spawnSync("docker", ["rm", "-f", containerName], { stdio: "ignore" });
    if (cleanup.error) {
      process.stderr.write(`Could not clean up isolated database container ${containerName}.\n`);
    }
  }
}
