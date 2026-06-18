import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/out/**"],
    environment: "jsdom",
    setupFiles: ["test/setup.ts"],
    // Run sequentially with a single fork — these are light jsdom tests, and
    // keeping the pool small avoids the OOM the repo has hit on uncapped runs.
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
  },
});
