import { context } from "esbuild";
import { exec } from "child_process";
import fs from "fs";

/** @typedef {import('esbuild').BuildOptions} BuildOptions **/

const args = process.argv.slice(2);
const OUTDIR_ARG = args.find((a) => a.startsWith("--outdir="));
const OUTDIR = OUTDIR_ARG ? OUTDIR_ARG.split("=")?.[1] : "dist";
const PRODUCTION = process.argv.includes("--production");
const WATCH = process.argv.includes("--watch");

/** @type {import('esbuild').Plugin} **/
const buildInlineWorkerPlugin = () => ({
  name: "build-inline-worker",
  setup: async (build) => {
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
    let compilerInlineWorkerContent = await fs.promises
      .readFile("../sparkdown/dist/sparkdown.js", "utf-8")
      .catch((e) => {
        console.error(e);
      });
    build.initialOptions.banner = {
      js: `
var process = {
env: {
COMPILER_INLINE_WORKER: ${JSON.stringify(compilerInlineWorkerContent)}
}
};`.trim(),
    };
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
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
