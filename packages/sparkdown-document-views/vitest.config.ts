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
    // Run test files sequentially. These are heavy jsdom + CodeMirror tests
    // whose rendered output depends on lezer incremental-parser warm-up state;
    // under file parallelism the warm-up order across files is
    // non-deterministic, which made a few separator/blank-line assertions flake
    // intermittently. Sequential execution makes the suite deterministic. (The
    // underlying parser warm-up sensitivity is tracked separately; this is the
    // reliable test-harness workaround, not a timeout band-aid.)
    fileParallelism: false,
  },
});
