import { defineConfig } from "@playwright/test";
import { BASELINE, CONTEXT_OPTS, PORT } from "./parity.config";

/**
 * Serves both stacks as production builds (`npm run start` = node ./out/api/index.js,
 * which reads PORT) on dedicated ports. The `out/` builds must already exist —
 * a later phase's global-setup will build on demand; for now build both stacks
 * once (`npm run build` in each impower-dev) before running.
 *
 * `reuseExistingServer: true` lets the two servers stay up across iterations.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  reporter: [
    ["html", { outputFolder: "report/playwright", open: "never" }],
    ["list"],
  ],
  timeout: 120_000,
  use: {
    ...CONTEXT_OPTS,
    ignoreHTTPSErrors: true,
  },
  webServer: [
    {
      command: "npm run start",
      cwd: BASELINE.cwd,
      env: { PORT: String(BASELINE.port) },
      url: BASELINE.origin + "/",
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "npm run start",
      cwd: PORT.cwd,
      env: { PORT: String(PORT.port) },
      url: PORT.origin + "/",
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
