import * as polyfill from "@esbuild-plugins/node-globals-polyfill";
import { context } from "esbuild";
import copy from "esbuild-plugin-copy-watch";
import * as glob from "glob";
import * as path from "path";

const PRODUCTION = process.argv.includes("--production");
const WATCH = process.argv.includes("--watch");

const LOG_PREFIX = WATCH ? "[watch] " : "";

/**
 * For web extension, all tests, including the test runner, need to be bundled into
 * a single module that has a exported `run` function .
 * This plugin bundles implements a virtual file extensionTests.ts that bundles all these together.
 * @type {import('esbuild').Plugin}
 */
const testBundle = () => ({
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

/** @typedef {import('esbuild').BuildOptions} BuildOptions **/
const config = {
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
    "iconv-lite": "iconv-lite",
    buffer: "buffer",
    os: "os-browserify/browser",
    path: "path-browserify",
    events: "events",
    stream: "stream-browserify",
    url: "url-browserify",
    "@codemirror/state": "@codemirror/state",
    "@lezer/common": "@lezer/common",
  },
  banner: {
    js: `const window = {};`,
  },

  plugins: [
    polyfill.NodeGlobalsPolyfillPlugin({
      process: true,
      buffer: true,
    }),
    copy({
      paths: [
        { from: "./data/*", to: "./data" },
        {
          from: "./node_modules/@vscode/codicons/dist/*",
          to: "./data",
        },
        {
          from: "./node_modules/@impower/sparkdown/dist/*",
          to: "./workers",
        },
        {
          from: "./node_modules/@impower/sparkdown-language-server/dist/*",
          to: "./workers",
        },
        {
          from: "./node_modules/@impower/sparkdown-screenplay-pdf/dist/*",
          to: "./workers",
        },
      ],
    }),
    testBundle(),
    esbuildProblemMatcher() /* add to the end of plugins array */,
  ],
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
