import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/out/**"],
    // Keep memory bounded: the engine pulls in the full compiler + runtime per
    // test, so cap workers and run serially to avoid OOM on large suites.
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
  resolve: {
    // The compiler (pulled in transitively to compile fixtures) depends on the
    // CodeMirror/Lezer grammar packages; dedupe them so a single copy is used
    // (mismatched copies break `instanceof` checks in the parser).
    dedupe: ["@codemirror/state", "@lezer/common"],
  },
});
