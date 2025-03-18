import { exec } from "child_process";
import { context } from "esbuild";
import fs from "fs";
import path from "path";

/** @typedef {import('esbuild').BuildOptions} BuildOptions **/

const args = process.argv.slice(2);
const OUTDIR_ARG = args.find((a) => a.startsWith("--outdir="));
const OUTDIR = OUTDIR_ARG ? OUTDIR_ARG.split("=")?.[1] : "dist";
const PRODUCTION = process.argv.includes("--production");
const WATCH = process.argv.includes("--watch");

const SPARKDOWN_SRC_PATH = "../sparkdown/src";
const SPARKDOWN_WORKER_FILE_PATH = "../sparkdown/dist/sparkdown.js";
const SPARKDOWN_PLACEHOLDER_FILENAME = "_inline-sparkdown-placeholder";

const LOG_PREFIX = WATCH ? "[watch] " : "";

const debounce = (callback, delay) => {
  let timeout = 0;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      callback(...args);
    }, delay);
  };
};

let inlineWorkerContent = "";
const updateInlineWorkerContent = async () => {
  try {
    // Build worker file
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
        console.log(
          LOG_PREFIX +
            `${path.basename(process.cwd())}: loaded inline worker contents (${
              inlineWorkerContent.length
            })`
        );
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
      console.log(
        LOG_PREFIX + `${path.basename(process.cwd())}: build started`
      );
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        if (location == null) return;
        console.error(
          `    ${location.file}:${location.line}:${location.column}:`
        );
      });
      console.log(
        LOG_PREFIX + `${path.basename(process.cwd())}: build finished`
      );
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
    await updateInlineWorkerContent();
    await ctx.watch();
    const debouncedRebuild = debounce(async (ctx) => {
      console.log(
        LOG_PREFIX + `Detected change in ${SPARKDOWN_SRC_PATH}, rebuilding...`
      );
      await updateInlineWorkerContent();
      await ctx.rebuild();
    }, 500);
    fs.watch(SPARKDOWN_SRC_PATH, { recursive: true }, () => {
      debouncedRebuild(ctx);
    });
  } else {
    await updateInlineWorkerContent();
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
