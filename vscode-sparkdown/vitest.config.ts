import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/out/**"],
    // Run sequentially with a single fork and let the caller cap the heap via
    // NODE_OPTIONS=--max-old-space-size. The repo has OOM-crashed on uncapped /
    // parallel runs, so keep the pool small and disable file parallelism.
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
  },
});
