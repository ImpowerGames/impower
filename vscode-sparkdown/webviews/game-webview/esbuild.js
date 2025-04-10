import * as esbuild from "esbuild";
import fs from "fs";
import path from "path";

const PRODUCTION = process.argv.includes("--production");
const WATCH = process.argv.includes("--watch");

const LOG_PREFIX = WATCH ? "[watch] " : "";

const SPARK_WEB_PLAYER_SRC_PATH = "../../../packages/spark-web-player/src";

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
        ...(extraConfig || {}),
      });
      let bundledText = result.outputFiles?.[0]?.text || "";
      const exportIndex = bundledText.lastIndexOf("export {");
      if (exportIndex >= 0) {
        bundledText = bundledText.slice(0, exportIndex);
      }
      console.log(
        LOG_PREFIX +
          `${path.basename(process.cwd())}: loaded inline worker contents (${
            bundledText.length
          })`
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
  plugins: [esbuildInlineWorkerPlugin(), esbuildProblemMatcher()],
};

async function main() {
  const ctx = await esbuild.context(config);
  if (WATCH) {
    await ctx.watch();
    const rebuild = async (ctx) => {
      console.log(
        LOG_PREFIX +
          `${path.basename(
            process.cwd()
          )}: detected change in ${SPARK_WEB_PLAYER_SRC_PATH}, rebuilding...`
      );
      await ctx.rebuild();
    };
    fs.watch(SPARK_WEB_PLAYER_SRC_PATH, { recursive: true }, () => {
      rebuild(ctx);
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
