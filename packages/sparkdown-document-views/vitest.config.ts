import { defineConfig } from "vitest/config";

// Dedupe @codemirror/* and @lezer/* across the monorepo's many file: deps.
// Each package has its own node_modules so transitive imports can pick up
// duplicate copies — that triggers Configuration "Unrecognized extension
// value" errors when two copies' instanceof checks see different classes.
// `resolve.dedupe` forces every import to collapse to a single copy, which is
// robust to npm hoisting. (An earlier hardcoded `<pkg>/node_modules` alias
// broke once these deps were hoisted to the workspace root, where that
// package-local path no longer exists — the import then failed to resolve.)
const SHARED_PACKAGES = [
  "@codemirror/autocomplete",
  "@codemirror/collab",
  "@codemirror/commands",
  "@codemirror/language",
  "@codemirror/lint",
  "@codemirror/search",
  "@codemirror/state",
  "@codemirror/view",
  "@lezer/common",
  "@lezer/highlight",
];

export default defineConfig({
  resolve: { dedupe: SHARED_PACKAGES },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "jsdom",
    pool: "threads",
    // The incremental-edit tests dispatch hundreds of single-character
    // transactions and reparse after each one; they run in a few seconds alone
    // but comfortably exceed vitest's 5s default when several jsdom workers are
    // competing for cores. A too-tight budget is just another way for the suite
    // to go red without anything being broken (#281), so give every test room
    // and let a genuine hang be the only thing that trips this.
    testTimeout: 30_000,
    // File parallelism is ON. It used to be disabled because these jsdom +
    // CodeMirror tests flaked under load, which looked like parser warm-up
    // sensitivity. The real cause (#281) was that the test helpers read
    // CodeMirror's syntax tree straight after creating a state or view —
    // and `@codemirror/language` budgets that initial parse by wall clock
    // (20ms), so a busy machine yielded a truncated document and an assertion
    // about missing content failed. Sequential execution only made the machine
    // less busy; it narrowed the window without closing it.
    //
    // The helpers now parse to completion before reading (see
    // test/helpers/parseSettle.ts, pinned by test/parse-settle.test.ts), so
    // the result no longer depends on timing at all and parallelism is safe.
    // It also takes the full suite from ~100s to under 20s.
  },
});
