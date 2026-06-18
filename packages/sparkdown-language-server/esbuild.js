import * as chokidar from "chokidar";
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

// Source dirs bundled INTO the inline worker, collected from its esbuild
// metafile (populated by the plugin below). esbuild's outer ctx.watch() can't
// see these — the inline worker is a separate build that bundles them opaquely
// — so in --watch mode we watch them explicitly. Previously hardcoded to
// `../sparkdown/src`, which missed every OTHER bundled @impower package (e.g.
// textmate-grammar-tree), so edits to those didn't hot-reload.
const workerSrcDirs = new Set();

/** @type {import('esbuild').Plugin} **/
const esbuildInlineWorkerPlugin = (extraConfig) => ({
  name: "esbuild-inline-worker",
  setup(build) {
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
      // Record each bundled SOURCE dir (…/<pkg>/src) so --watch can track the
      // worker's deep deps (sparkdown, textmate-grammar-tree, …).
      for (const input of Object.keys(result.metafile?.inputs ?? {})) {
        // esbuild lists namespaced inputs as `<namespace>:<path>` — e.g. a ?raw
        // import resolved into rawPlugin's `raw-loader` namespace. Strip it to
        // recover the real path (mirrors the player worker-HMR fix).
        const real = input.startsWith("raw-loader:")
          ? input.slice("raw-loader:".length)
          : input;
        if (real.includes("node_modules")) continue;
        const m = real.replace(/\\/g, "/").match(/^(.*\/src)\//);
        if (m) workerSrcDirs.add(path.resolve(m[1]));
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
      console.log(LOG_PREFIX + `build finished`);
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
};

async function main() {
  const ctx = await esbuild.context(config);
  if (WATCH) {
    // Explicit initial build FIRST so the inline-worker onLoad runs and
    // populates workerSrcDirs before we set up the dep watcher. (ctx.watch()'s
    // promise can resolve before its first build's onLoad finishes.)
    await ctx.rebuild();
    // Native watch covers this worker's OWN src (the outer build graph).
    await ctx.watch();

    const rebuild = async () => {
      console.log(LOG_PREFIX + `detected worker-dep change, rebuilding...`);
      try {
        await ctx.rebuild();
      } catch (e) {
        // A transient/syntax error in a watched dep must not kill the watcher —
        // log and keep watching so the next save hot-reloads.
        console.error(LOG_PREFIX + "rebuild failed:", e?.message ?? e);
      }
    };

    // Watch every source dir bundled into the inline worker (sparkdown,
    // textmate-grammar-tree, …) — not just the compiler — so any of them
    // hot-reloads.
    if (workerSrcDirs.size > 0) {
      chokidar
        .watch([...workerSrcDirs], {
          ignoreInitial: true,
          persistent: true,
          depth: 99,
        })
        .on("all", rebuild);
    }
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
