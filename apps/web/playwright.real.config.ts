import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const apiRoot = path.resolve(process.cwd(), "../api");
const apiPython =
  process.env.API_PYTHON ??
  path.join(
    apiRoot,
    ".venv",
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
  );
const apiPort = process.env.E2E_API_PORT ?? "8000";
const webPort = process.env.E2E_WEB_PORT ?? "4175";
const apiDatabaseUrl = process.env.API_DATABASE_URL;
const jwtSecret = process.env.E2E_TEST_JWT_SECRET;
const userId = process.env.E2E_USER_ID;
const supabaseUrl = process.env.VITE_SUPABASE_URL;

if (!apiDatabaseUrl || !jwtSecret || !userId || !supabaseUrl) {
  throw new Error("Run real-stack tests with npm run test:e2e:real.");
}

const apiOrigin = `http://127.0.0.1:${apiPort}`;
const webOrigin = `http://127.0.0.1:${webPort}`;
const quotedPython = `"${apiPython.replaceAll('"', '\\"')}"`;

export default defineConfig({
  testDir: "./e2e-real",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: webOrigin,
    ...devices["Desktop Chrome"],
  },
  webServer: [
    {
      command: `${quotedPython} -m uvicorn overcall.main:app --host 127.0.0.1 --port ${apiPort}`,
      cwd: apiRoot,
      url: `${apiOrigin}/readyz`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        APP_ENV: "test",
        DATABASE_URL: apiDatabaseUrl,
        SUPABASE_URL: supabaseUrl,
        SUPABASE_JWT_SECRET: jwtSecret,
        INGEST_KEY_PEPPER: "local-real-e2e-ingest-key-pepper-not-production",
        INTERNAL_TOKEN: "local-real-e2e-internal-token-not-production",
        CORS_ORIGINS: webOrigin,
        LOG_LEVEL: "WARNING",
      },
    },
    {
      command: `npm run dev -- --mode test --host 127.0.0.1 --port ${webPort}`,
      cwd: process.cwd(),
      url: webOrigin,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        VITE_API_MODE: "real",
        VITE_AUTH_MODE: "supabase",
        VITE_BACKEND_URL: apiOrigin,
        VITE_SUPABASE_URL: supabaseUrl,
        VITE_SUPABASE_ANON_KEY: "local-real-e2e-anon-key",
        VITE_SITE_URL: webOrigin,
      },
    },
  ],
});
