import { context } from "esbuild";
import fs from "fs";

fs.watchFile;

/** @typedef {import('esbuild').BuildOptions} BuildOptions **/

const args = process.argv.slice(2);
const OUTDIR_ARG = args.find((a) => a.startsWith("--outdir="));
const OUTDIR = OUTDIR_ARG ? OUTDIR_ARG.split("=")?.[1] : "dist";
const PRODUCTION = process.argv.includes("--production");
const WATCH = process.argv.includes("--watch");

const SPARKDOWN_WORKER_FILE = "../sparkdown/dist/sparkdown.js";

/** @type {import('esbuild').Plugin} **/
const buildInlineWorkerPlugin = () => ({
  name: "build-inline-worker",
  setup(build) {
    let compilerInlineWorkerContent = "";

    const updateWorkerContent = async () => {
      try {
        compilerInlineWorkerContent = await fs.promises.readFile(
          SPARKDOWN_WORKER_FILE,
          "utf-8"
        );
      } catch (e) {
        console.error("[Error] Failed to read sparkdown.js:", e);
        compilerInlineWorkerContent = "";
      }
    };

    // Initial read before first build
    updateWorkerContent();

    if (WATCH) {
      fs.watchFile(SPARKDOWN_WORKER_FILE, { interval: 500 }, async () => {
        console.log(
          `[watch] Detected change in ${SPARKDOWN_WORKER_FILE}, updating worker content...`
        );
        await updateWorkerContent();
      });
    }

    build.onLoad({ filter: /_inline-worker-placeholder\.ts$/ }, async () => {
      return {
        contents: compilerInlineWorkerContent,
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
      console.log("[watch] build started");
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        if (location == null) return;
        console.error(
          `    ${location.file}:${location.line}:${location.column}:`
        );
      });
      console.log("[watch] build finished");
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
  plugins: [esbuildProblemMatcher(), buildInlineWorkerPlugin()],
};

async function main() {
  const ctx = await context(config);
  if (WATCH) {
    await ctx.watch();
    console.log(`[watch] Watching for changes in ${SPARKDOWN_WORKER_FILE}`);
    fs.watchFile(SPARKDOWN_WORKER_FILE, { interval: 500 }, async () => {
      console.log(
        `[watch] Detected change in ${SPARKDOWN_WORKER_FILE}, rebuilding...`
      );
      await ctx.rebuild();
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
