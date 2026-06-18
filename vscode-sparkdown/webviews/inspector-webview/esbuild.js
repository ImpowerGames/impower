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

const SPARKDOWN_STRUCT_INSPECTOR_SRC_PATH =
  "../../../packages/sparkdown-inspector/src";

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
      });
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
  entryPoints: ["./inspector-webview.ts"],
  outfile: "../../out/webviews/inspector-webview.js",
  plugins: [rawPlugin, esbuildInlineWorkerPlugin(), esbuildProblemMatcher()],
};

async function main() {
  const ctx = await esbuild.context(config);
  if (WATCH) {
    await ctx.watch();
    chokidar
      .watch(SPARKDOWN_STRUCT_INSPECTOR_SRC_PATH, {
        ignoreInitial: true,
        persistent: true,
        depth: 99,
      })
      .on("all", async () => {
        console.log(
          LOG_PREFIX +
            `detected change in ${SPARKDOWN_STRUCT_INSPECTOR_SRC_PATH}, rebuilding...`,
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
