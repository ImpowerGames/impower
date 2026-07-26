import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/out/**"],
    // Threads rather than forks. Run time here is dominated by transforming
    // and evaluating a large module graph (`Game` reaches the inkjs engine),
    // not by the tests themselves -- they finish in well under a second.
    // Sharing one process instead of spawning forks roughly halves it.
    //
    // Measured over 5 runs each, since single runs vary by 3x on a busy
    // machine: forks 22.3-43.0s (median 29.8s), threads 8.7-24.7s (median
    // 13.4s). Use watch mode while working -- an unaffected file reruns in
    // ~270ms.
    pool: "threads",
  },
});
