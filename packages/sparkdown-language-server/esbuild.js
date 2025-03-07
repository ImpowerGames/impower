import { exec } from "child_process";
import { context } from "esbuild";
import fs from "fs";

/** @typedef {import('esbuild').BuildOptions} BuildOptions **/

const args = process.argv.slice(2);
const OUTDIR_ARG = args.find((a) => a.startsWith("--outdir="));
const OUTDIR = OUTDIR_ARG ? OUTDIR_ARG.split("=")?.[1] : "dist";
const PRODUCTION = process.argv.includes("--production");
const WATCH = process.argv.includes("--watch");

const SPARKDOWN_WORKER_FILE_PATH = "../sparkdown/dist/sparkdown.js";
const SPARKDOWN_PLACEHOLDER_FILENAME = "_inline-sparkdown-placeholder";

let inlineWorkerContent = "";
const updateInlineWorkerContent = async () => {
  try {
    inlineWorkerContent = await fs.promises.readFile(
      SPARKDOWN_WORKER_FILE_PATH,
      "utf-8"
    );
  } catch (e) {
    console.error(`[Error] Failed to read ${SPARKDOWN_WORKER_FILE_PATH}:`, e);
    inlineWorkerContent = "";
  }
};

/** @type {import('esbuild').Plugin} **/
const buildInlineWorkerPlugin = (placeholderFileName) => ({
  name: "build-inline-worker",
  setup(build) {
    build.onLoad(
      { filter: new RegExp(`${placeholderFileName}\.(?:ts|js)$`) },
      async () => {
        return {
          contents: inlineWorkerContent,
          loader: "text",
        };
      }
    );
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
  plugins: [
    esbuildProblemMatcher(),
    buildInlineWorkerPlugin(SPARKDOWN_PLACEHOLDER_FILENAME),
  ],
};

async function main() {
  const ctx = await context(config);
  if (WATCH) {
    await ctx.watch();
    console.log(
      `[watch] Watching for changes in ${SPARKDOWN_WORKER_FILE_PATH}`
    );
    fs.watchFile(SPARKDOWN_WORKER_FILE_PATH, { interval: 500 }, async () => {
      console.log(
        `[watch] Detected change in ${SPARKDOWN_WORKER_FILE_PATH}, rebuilding...`
      );
      await updateInlineWorkerContent();
      await ctx.rebuild();
    });
  } else {
    // Build worker file
    console.log(`Building ${SPARKDOWN_WORKER_FILE_PATH}`);
    await new Promise((resolve) => {
      exec(
        `npm run build:${PRODUCTION ? "prod" : "dev"}:workers`,
        (error, _stdout, stderr) => {
          if (error) {
            console.error(error);
          }
          if (stderr) {
            console.error(stderr);
          }
          resolve();
        }
      );
    });
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
