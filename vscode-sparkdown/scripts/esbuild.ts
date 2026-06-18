import * as polyfill from "@esbuild-plugins/node-globals-polyfill";
import esbuild from "esbuild";
import copy from "esbuild-plugin-copy-watch";
import fs from "fs";
import * as glob from "glob";
import path from "path";

const PRODUCTION = process.argv.includes("--production");
const WATCH = process.argv.includes("--watch");

/**
 * Honor Vite's `?raw` query in esbuild: resolve a `*?raw` import to the real
 * file in a dedicated namespace, then load its contents as a text string.
 * Gives esbuild parity with Vite/vitest (which support `?raw` natively) so the
 * same `import text from "./some.file?raw"` works in code bundled by either.
 */
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

/**
 * For web extension, all tests, including the test runner, need to be bundled into
 * a single module that has a exported `run` function .
 * This plugin bundles implements a virtual file extensionTests.ts that bundles all these together.
 */
const testBundle = (): esbuild.Plugin => ({
  name: "testBundle",
  setup(build) {
    build.onResolve({ filter: /[\/\\]extensionTests\.ts$/ }, (args) => {
      if (args.kind === "entry-point") {
        return { path: path.resolve(args.path) };
      }
    });
    build.onLoad({ filter: /[\/\\]extensionTests\.ts$/ }, async (args) => {
      const testsRoot = path.join(process.cwd(), "./src/web/test/suite");
      const files = await glob.glob("*.test.{ts,tsx}", {
        cwd: testsRoot,
        posix: true,
      });
      return {
        contents:
          `export { run } from './mochaTestRunner.ts';` +
          files.map((f) => `import('./${f}');`).join(""),
        watchDirs: files.map((f) => path.dirname(path.resolve(testsRoot, f))),
        watchFiles: files.map((f) => path.resolve(testsRoot, f)),
      };
    });
  },
});

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
      console.log(LOG_PREFIX + `build finished`);
    });
  },
});

const config: esbuild.BuildOptions = {
  entryPoints: ["src/extension.ts", "src/web/test/suite/extensionTests.ts"],
  bundle: true,
  format: "cjs",
  minify: PRODUCTION,
  sourcemap: !PRODUCTION,
  sourcesContent: false,
  platform: "browser",
  outdir: "out",
  external: ["vscode", "child_process", "crypto", "fs"],
  logLevel: "warning",
  // Node.js global to browser globalThis
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
    }),
    copy({
      paths: [
        { from: "./data/*", to: "./data" },
        { from: "../packages/spark-web-player/types/*", to: "./data" },
        // After the npm-workspaces migration these deps are hoisted to the
        // monorepo ROOT node_modules, so the old `./node_modules/...` (local)
        // paths resolve to nothing and silently copy zero files. Read the
        // workspace package dists straight from `../packages/<pkg>/dist`
        // (deterministic regardless of hoisting, like the spark-web-player
        // entry above) and the external codicons from the root node_modules.
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
    }),
    testBundle(),
    esbuildProblemMatcher() /* add to the end of plugins array */,
  ],
  metafile: true,
};

async function main() {
  const ctx = await esbuild.context(config);
  if (WATCH) {
    await ctx.watch();
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
