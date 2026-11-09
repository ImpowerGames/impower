import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/out/**"],
    environment: "jsdom",
    pool: "forks",
    fileParallelism: false,
  },
});
