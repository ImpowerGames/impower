import { compile } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";
import { context } from "esbuild";
import fs from "fs";
import path from "path";

const PRODUCTION = process.argv.includes("--production");
const WATCH = process.argv.includes("--watch");

/**
 * Compile a Tailwind entry CSS to a string at build time, importable as
 * `import css from "./foo.css?tw"`. Used to inject impower-ui's utilities into
 * the webview, which (unlike impower-dev's Vite build) has no global Tailwind
 * stylesheet. Scans the entry's `@source` dirs for class candidates, so the
 * output tracks whatever classes the rendered components use.
 * @type {import('esbuild').Plugin}
 */
const tailwindLoader = () => ({
  name: "tailwind-loader",
  setup(build) {
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
        return { contents: `export default ${JSON.stringify(css)};`, watchFiles };
      },
    );
  },
});

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
  // Compile JSX with Preact's automatic runtime for EVERY bundled file, not
  // just those whose nearest tsconfig opts in. impower-ui's .tsx (e.g.
  // LoadingBar) use the automatic runtime with no `React`/`h` import, so
  // without this esbuild falls back to classic `React.createElement` and the
  // component throws `ReferenceError: React is not defined` at render. Mirrors
  // impower-dev's @preact/preset-vite (jsxImportSource: "preact").
  jsx: "automatic",
  jsxImportSource: "preact",
  // Resolve workspace packages' `development` export condition to their TS
  // source, matching how impower-dev's Vite consumes them. Without this,
  // `@impower/impower-ui/loading-bar` (pulled in via @impower/sparkdown-document-views)
  // falls through to the `import` condition's built `dist/impower-ui.js`, which
  // is gitignored and never produced by this build chain — so the bundle would
  // fail to resolve it.
  conditions: ["development"],
  entryPoints: ["./screenplay-webview.ts"],
  outfile: "../../out/webviews/screenplay-webview.js",
  plugins: [rawLoader(), tailwindLoader(), esbuildProblemMatcher()],
  alias: {
    // NB: impower-ui is imported via its `./loading-bar` subpath (not the
    // components barrel), so the Radix-based components — and their `react`
    // imports — never enter this bundle. No react→preact/compat alias needed.
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
