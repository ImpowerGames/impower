import * as esbuild from "esbuild";
import path from "path";

const PRODUCTION = process.argv.includes("--production");
const WATCH = process.argv.includes("--watch");

const LOG_PREFIX = WATCH ? "[watch] " : "";

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
        ...(extraConfig || {}),
      });
      const bundledText = result.outputFiles[0].text;
      const bundledTextWithoutExport = bundledText.slice(
        0,
        bundledText.lastIndexOf("export ")
      );
      console.log(
        LOG_PREFIX +
          `${path.basename(process.cwd())}: loaded inline worker contents (${
            bundledTextWithoutExport.length
          })`
      );
      return {
        contents: bundledTextWithoutExport,
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
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
