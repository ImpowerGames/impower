import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
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
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
  },
});
