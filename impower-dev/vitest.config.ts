import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // This browser-only export has no Node/default condition, even in jsdom.
  resolve: {
    alias: {
      "vscode-jsonrpc/browser": fileURLToPath(new URL("../node_modules/vscode-jsonrpc/lib/browser/main.js", import.meta.url)),
    },
  },
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
