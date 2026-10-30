import * as polyfill from "@esbuild-plugins/node-globals-polyfill";
import esbuild from "esbuild";
import copy from "esbuild-plugin-copy-watch";
import fs from "fs";
import path from "path";

const PRODUCTION = process.argv.includes("--production");
const WATCH = process.argv.includes("--watch");

const rawPlugin = (): esbuild.Plugin => ({
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
});

const LOG_PREFIX =
  (WATCH ? "[watch] " : "") + `${path.basename(process.cwd())}: `;

const esbuildProblemMatcher = (): esbuild.Plugin => ({
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

const config: esbuild.BuildOptions = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  format: "cjs",
  minify: PRODUCTION,
  sourcemap: !PRODUCTION,
  sourcesContent: false,
  platform: "browser",
  outdir: "out",
  external: ["vscode", "child_process", "crypto", "fs"],
  logLevel: "warning",
  define: {
    global: "globalThis",
  },
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
    "iconv-lite": "iconv-lite",
    "style-mod": "style-mod",
    "vscode-jsonrpc/browser": "vscode-jsonrpc/browser",
    "vscode-languageserver-protocol": "vscode-languageserver-protocol",
    "vscode-languageserver-textdocument": "vscode-languageserver-textdocument",
    buffer: "buffer",
    events: "events",
    marked: "marked",
    os: "os-browserify/browser",
    path: "path-browserify",
    stream: "stream-browserify",
    url: "url-browserify",
  },
  banner: {
    js: `const window = {};`,
  },

  plugins: [
    rawPlugin(),
    polyfill.NodeGlobalsPolyfillPlugin({
      process: true,
      buffer: true,
    }) as unknown as esbuild.Plugin,
    copy({
      paths: [
        { from: "./data/*", to: "./data" },
        { from: "../packages/spark-web-player/types/*", to: "./data" },
        {
          from: "../node_modules/@vscode/codicons/dist/*",
          to: "./data",
        },
        {
          from: "../packages/sparkdown/dist/*",
          to: "./workers",
        },
        {
          from: "../packages/sparkdown-language-server/dist/*",
          to: "./workers",
        },
        {
          from: "../packages/sparkdown-screenplay-pdf/dist/*",
          to: "./workers",
        },
      ],
    }) as unknown as esbuild.Plugin,
    esbuildProblemMatcher(),
  ],
  metafile: true,
};

async function main() {
  const ctx = await esbuild.context(config);
  if (WATCH) {
    const { watchBuild } = await import("../../scripts/esbuild-watch.mjs");
    await watchBuild(ctx, {
      onError: (e) =>
        console.error(
          LOG_PREFIX + "rebuild failed:",
          e instanceof Error ? e.message : e,
        ),
    });
  } else {
    const result = await ctx.rebuild();
    if (PRODUCTION && result.metafile) {
      const analysis = await esbuild.analyzeMetafile(result.metafile, {
        color: true,
      });
      console.log(analysis);
    }
    await ctx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
