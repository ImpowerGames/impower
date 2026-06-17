import { resolve } from "path";
import { defineConfig } from "vitest/config";

// Dedupe @codemirror/* and @lezer/* across the monorepo's many file: deps.
// Each package has its own node_modules so transitive imports can pick up
// duplicate copies — that triggers Configuration "Unrecognized extension
// value" errors when two copies' instanceof checks see different classes.
// Forcing all to resolve from THIS package's node_modules fixes it for tests
// the same way the webview's esbuild aliases fix it for the bundle.
const here = (p: string) =>
  resolve(__dirname, "node_modules", p);

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

const alias: Record<string, string> = {};
for (const pkg of SHARED_PACKAGES) {
  alias[pkg] = here(pkg);
}

export default defineConfig({
  resolve: { alias },
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
