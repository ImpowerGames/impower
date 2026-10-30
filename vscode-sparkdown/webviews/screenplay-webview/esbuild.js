import { compile } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";
import { context } from "esbuild";
import fs from "fs";
import path from "path";

const PRODUCTION = process.argv.includes("--production");
const WATCH = process.argv.includes("--watch");

const tailwindInputs = new Set();

/** @type {import('esbuild').Plugin} */
const tailwindLoader = () => ({
  name: "tailwind-loader",
  setup(build) {
    build.onStart(() => {
      tailwindInputs.clear();
    });
    build.onResolve({ filter: /\?tw$/ }, (args) => ({
      path: path.resolve(args.resolveDir, args.path.replace(/\?tw$/, "")),
      namespace: "tailwind-loader",
    }));
    build.onLoad(
      { filter: /.*/, namespace: "tailwind-loader" },
      async (args) => {
        const input = await fs.promises.readFile(args.path, "utf8");
        const base = path.dirname(args.path);
        const watchFiles = [args.path];
        const compiler = await compile(input, {
          base,
          onDependency: (file) => watchFiles.push(file),
        });
        const scanner = new Scanner({ sources: compiler.sources });
        const css = compiler.build(scanner.scan());
        for (const file of watchFiles) tailwindInputs.add(file);
        return { contents: `export default ${JSON.stringify(css)};`, watchFiles };
      },
    );
  },
});

/** @type {import('esbuild').Plugin} */
const rawLoader = () => ({
  name: "raw-loader",
  setup(build) {
    build.onResolve({ filter: /\?raw$/ }, (args) => ({
      path: path.resolve(args.resolveDir, args.path.replace(/\?raw$/, "")),
      namespace: "raw-loader",
    }));
    build.onLoad({ filter: /.*/, namespace: "raw-loader" }, async (args) => ({
      contents: await fs.promises.readFile(args.path, "utf8"),
      loader: "text",
    }));
  },
});

const LOG_PREFIX =
  (WATCH ? "[watch] " : "") + `${path.basename(process.cwd())}: `;

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
  jsx: "automatic",
  jsxImportSource: "preact",
  conditions: ["development"],
  entryPoints: ["./screenplay-webview.ts"],
  outfile: "../../out/webviews/screenplay-webview.js",
  plugins: [rawLoader(), tailwindLoader(), esbuildProblemMatcher()],
  alias: {
    "@codemirror/autocomplete": "@codemirror/autocomplete",
    "@codemirror/collab": "@codemirror/collab",
    "@codemirror/commands": "@codemirror/commands",
    "@codemirror/language": "@codemirror/language",
    "@codemirror/lint": "@codemirror/lint",
    "@codemirror/search": "@codemirror/search",
    "@codemirror/state": "@codemirror/state",
    "@codemirror/view": "@codemirror/view",
    "@lezer/common": "@lezer/common",
    "@lezer/highlight": "@lezer/highlight",
  },
  metafile: WATCH,
};

async function main() {
  const ctx = await context(config);
  if (WATCH) {
    const { watchBuild } = await import("../../../scripts/esbuild-watch.mjs");
    await watchBuild(ctx, {
      extraInputs: () => tailwindInputs,
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
