import * as esbuild from "esbuild";
import fs from "fs";
import path from "path";

const PRODUCTION = process.argv.includes("--production");
const WATCH = process.argv.includes("--watch");

/** @type {import('esbuild').Plugin} */
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
        define: {
          global: "globalThis",
        },
        plugins: [rawPlugin],
        ...(extraConfig || {}),
        metafile: true,
      });
      for (const input of Object.keys(result.metafile?.inputs ?? {})) {
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
  metafile: WATCH,
};

async function main() {
  const ctx = await esbuild.context(config);
  if (WATCH) {
    // workaround(esbuild): ctx.watch() polls the build graph's files rather than using change notifications
    const { watchBuild } = await import("../../../scripts/esbuild-watch.mjs");
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
