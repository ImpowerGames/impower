import { context } from "esbuild";
import fs from "fs";
import path from "path";

const PRODUCTION = process.argv.includes("--production");
const WATCH = process.argv.includes("--watch");

/**
 * Honor Vite's `?raw` query in esbuild: import the file's contents as a text
 * string. Lets packages shared with the Vite-built editor (notably
 * @impower/sparkdown-document-views) import CSS as a string portably across
 * both bundlers — `import cssText from "./foo.css?raw"`.
 * @type {import('esbuild').Plugin}
 */
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
  entryPoints: ["./screenplay-webview.ts"],
  outfile: "../../out/webviews/screenplay-webview.js",
  plugins: [rawLoader(), esbuildProblemMatcher()],
  alias: {
    // Force every transitive @codemirror/* import to resolve from THIS build
    // root so we end up with one copy in the bundle. Without this, esbuild
    // walks up from each importing file and can pick up multiple copies (one
    // per package node_modules), and instanceof checks across copies fail.
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
