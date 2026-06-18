import * as chokidar from "chokidar";
import * as esbuild from "esbuild";
import fs from "fs";
import path from "path";

const PRODUCTION = process.argv.includes("--production");
const WATCH = process.argv.includes("--watch");

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

const LOG_PREFIX =
  (WATCH ? "[watch] " : "") + `${path.basename(process.cwd())}: `;

// Source dirs bundled INTO the inline worker (game.worker → spark-web-player,
// spark-engine, the compiler, textmate-grammar-tree, …), collected from the
// worker's esbuild metafile below. esbuild's outer ctx.watch() can't see them
// (the inline worker is a separate build), so we watch them explicitly. This
// was hardcoded to just spark-web-player/src, missing engine/compiler/grammar.
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
        define: {
          global: "globalThis",
        },
        plugins: [rawPlugin],
        ...(extraConfig || {}),
        metafile: true,
      });
      // Record each bundled SOURCE dir (…/<pkg>/src) so --watch tracks the
      // worker's deep deps, not just spark-web-player.
      for (const input of Object.keys(result.metafile?.inputs ?? {})) {
        // esbuild lists namespaced inputs as `<namespace>:<path>` (e.g. a ?raw
        // import in rawPlugin's `raw-loader` namespace). Strip it first.
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

/** @type {import('esbuild').BuildOptions} BuildOptions **/
const config = {
  bundle: true,
  minify: PRODUCTION,
  sourcemap: !PRODUCTION,
  loader: {
    ".html": "text",
    ".css": "text",
    ".svg": "text",
  },
  target: "es2020",
  platform: "browser",
  format: "esm",
  entryPoints: ["./game-webview.ts"],
  outfile: "../../out/webviews/game-webview.js",
  plugins: [rawPlugin, esbuildInlineWorkerPlugin(), esbuildProblemMatcher()],
};

async function main() {
  const ctx = await esbuild.context(config);
  if (WATCH) {
    // Explicit initial build FIRST so the inline-worker onLoad runs and
    // populates workerSrcDirs before we set up the dep watcher.
    await ctx.rebuild();
    // Native watch covers this webview's own src (the outer build graph).
    await ctx.watch();
    if (workerSrcDirs.size > 0) {
      chokidar
        .watch([...workerSrcDirs], {
          ignoreInitial: true,
          persistent: true,
          depth: 99,
        })
        .on("all", async () => {
          console.log(LOG_PREFIX + `detected worker-dep change, rebuilding...`);
          try {
            await ctx.rebuild();
          } catch (e) {
            // A build error must not kill the watcher.
            console.error(LOG_PREFIX + "rebuild failed:", e?.message ?? e);
          }
        });
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
