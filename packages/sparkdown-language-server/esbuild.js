import * as esbuild from "esbuild";
import fs from "fs";
import path from "path";

/** @typedef {import('esbuild').BuildOptions} BuildOptions **/

/**
 * Honor Vite's `?raw` query in esbuild: resolve a `*?raw` import to the real
 * file in a dedicated namespace, then load its contents as a text string.
 * Gives esbuild parity with Vite/vitest (which support `?raw` natively) so the
 * same `import text from "./some.file?raw"` works in code bundled by either.
 * @type {import('esbuild').Plugin}
 */
const rawPlugin = {
  name: "raw",
  setup(build) {
    build.onResolve({ filter: /\?raw$/ }, (args) => {
      const target = args.path.slice(0, -4);
      return {
        path: path.isAbsolute(target)
          ? target
          : path.join(args.resolveDir, target),
        namespace: "raw-loader",
      };
    });
    build.onLoad({ filter: /.*/, namespace: "raw-loader" }, (args) => ({
      contents: fs.readFileSync(args.path, "utf8"),
      loader: "text",
    }));
  },
};

const args = process.argv.slice(2);
const OUTDIR_ARG = args.find((a) => a.startsWith("--outdir="));
const OUTDIR = OUTDIR_ARG ? OUTDIR_ARG.split("=")?.[1] : "dist";
const PRODUCTION = process.argv.includes("--production");
const WATCH = process.argv.includes("--watch");

const LOG_PREFIX =
  (WATCH ? "[watch] " : "") + `${path.basename(process.cwd())}: `;

// Source files bundled INTO the inline worker, collected from its esbuild
// metafile on every outer build (by the plugin below). The outer build's own
// metafile can't list these — the inline worker is a separate build that
// bundles them opaquely — so in --watch mode they are handed to the watcher
// explicitly. This covers every bundled @impower package (sparkdown,
// textmate-grammar-tree, …), not just the compiler.
const workerInputs = new Set();

/** @type {import('esbuild').Plugin} **/
const esbuildInlineWorkerPlugin = (extraConfig) => ({
  name: "esbuild-inline-worker",
  setup(build) {
    build.onStart(() => {
      workerInputs.clear();
    });
    build.onLoad({ filter: /\.worker\.(?:ts|js)$/ }, async (args) => {
      const result = await esbuild.build({
        entryPoints: [args.path],
        write: false,
        bundle: true,
        minify: PRODUCTION,
        format: "esm",
        target: "esnext",
        plugins: [rawPlugin],
        ...(extraConfig || {}),
        metafile: true,
      });
      // Record each bundled SOURCE file so --watch can track the worker's deep
      // deps (sparkdown, textmate-grammar-tree, …).
      for (const input of Object.keys(result.metafile?.inputs ?? {})) {
        // esbuild lists namespaced inputs as `<namespace>:<path>` — e.g. a ?raw
        // import resolved into rawPlugin's `raw-loader` namespace. Strip it to
        // recover the real path (mirrors the player worker-HMR fix).
        const real = input.startsWith("raw-loader:")
          ? input.slice("raw-loader:".length)
          : input;
        if (real.includes("node_modules")) continue;
        workerInputs.add(path.resolve(real));
      }
      let bundledText = result.outputFiles?.[0]?.text || "";
      const exportIndex = bundledText.lastIndexOf("export");
      if (exportIndex >= 0) {
        bundledText = bundledText.slice(0, exportIndex);
      }
      console.log(
        LOG_PREFIX + `loaded inline worker contents (${bundledText.length})`,
      );
      return {
        contents: bundledText,
        loader: "text",
      };
    });
  },
});

/** @type {import('esbuild').Plugin} **/
const esbuildProblemMatcher = () => ({
  name: "esbuildProblemMatcher",
  setup(build) {
    build.onStart(() => {
      console.log(LOG_PREFIX + `build started`);
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        if (location == null) return;
        console.error(
          `    ${location.file}:${location.line}:${location.column}:`,
        );
      });
      console.log(LOG_PREFIX + (result.errors.length ? "build failed" : "build finished"));
    });
  },
});

/** @type BuildOptions */
const config = {
  entryPoints: ["./src/sparkdown-language-server.ts"],
  outdir: OUTDIR,
  bundle: true,
  minify: PRODUCTION,
  sourcemap: !PRODUCTION,
  mainFields: ["module", "main"],
  external: ["vscode", "commonjs"],
  alias: {
    "@codemirror/state": "@codemirror/state",
    "@lezer/common": "@lezer/common",
  },
  plugins: [rawPlugin, esbuildInlineWorkerPlugin(), esbuildProblemMatcher()],
  metafile: WATCH,
};

async function main() {
  const ctx = await esbuild.context(config);
  if (WATCH) {
    // Not ctx.watch(), which polls the build graph's files; the helper watches
    // the outer graph and the inline worker's inputs from change notifications.
    // A transient/syntax error in a watched file must not kill the watcher — it
    // logs and keeps watching so the next save hot-reloads.
    const { watchBuild } = await import("../../scripts/esbuild-watch.mjs");
    await watchBuild(ctx, {
      extraInputs: () => workerInputs,
      onError: (e) => console.error(LOG_PREFIX + "rebuild failed:", e?.message ?? e),
    });
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
