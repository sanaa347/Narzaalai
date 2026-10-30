import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a PRODUCTION build served on their own port, with their own scratch database and
 * upload directory under `.tmp/e2e/` (recreated on every run, guarded in e2e/prepare.ts). They never touch
 * data/narzaalai.db or data/uploads, and the build goes to `.next-e2e` so a running `next dev` is unaffected.
 */
const PORT = 3101;
const env = {
  NARZAALAI_DB_PATH: ".tmp/e2e/e2e.db",
  NARZAALAI_UPLOAD_DIR: ".tmp/e2e/uploads",
  NEXT_DIST_DIR: ".next-e2e",
  SEED_PASSWORD: "e2e-demo-password-1",
  NEXT_TELEMETRY_DISABLED: "1",
};

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  outputDir: ".tmp/e2e-results",
  webServer: {
    command: `npx tsx e2e/prepare.ts && npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: { ...env, NODE_ENV: "production" },
  },
});
