import * as polyfill from "@esbuild-plugins/node-globals-polyfill";
import esbuild from "esbuild";
import copy from "esbuild-plugin-copy-watch";
import * as glob from "glob";
import path from "path";

const PRODUCTION = process.argv.includes("--production");
const WATCH = process.argv.includes("--watch");

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
          `    ${location.file}:${location.line}:${location.column}:`
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
        { from: "../packages/spark-web-player/types/*", to: "./data" },
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
