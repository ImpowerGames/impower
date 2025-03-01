import { context } from "esbuild";
import * as glob from "glob";
import * as path from "path";
import * as polyfill from "@esbuild-plugins/node-globals-polyfill";
import { copy } from "esbuild-plugin-copy";

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/** @typedef {import('esbuild').BuildOptions} BuildOptions **/

async function main() {
  const ctx = await context({
    entryPoints: ["src/extension.ts", "src/web/test/suite/extensionTests.ts"],
    bundle: true,
    format: "cjs",
    minify: production,
    sourcemap: !production,
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
    },

    plugins: [
      polyfill.NodeGlobalsPolyfillPlugin({
        process: true,
        buffer: true,
      }),
      testBundlePlugin,
      esbuildProblemMatcherPlugin /* add to the end of plugins array */,
      copy({
        resolveFrom: "cwd",
        assets: { from: ["./data/*"], to: ["./out/data"] },
        watch: true,
      }),
      copy({
        resolveFrom: "cwd",
        assets: {
          from: ["./node_modules/@vscode/codicons/dist/*"],
          to: ["./out/data"],
        },
        watch: true,
      }),
      copy({
        resolveFrom: "cwd",
        assets: {
          from: ["./node_modules/@impower/sparkdown/dist/*"],
          to: ["./out/workers"],
        },
        watch: true,
      }),
      copy({
        resolveFrom: "cwd",
        assets: {
          from: ["./node_modules/@impower/sparkdown-language-server/dist/*"],
          to: ["./out/workers"],
        },
        watch: true,
      }),
      copy({
        resolveFrom: "cwd",
        assets: {
          from: ["./node_modules/@impower/sparkdown-screenplay-pdf/dist/*"],
          to: ["./out/workers"],
        },
        watch: true,
      }),
    ],
  });
  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

/**
 * For web extension, all tests, including the test runner, need to be bundled into
 * a single module that has a exported `run` function .
 * This plugin bundles implements a virtual file extensionTests.ts that bundles all these together.
 * @type {import('esbuild').Plugin}
 */
const testBundlePlugin = {
  name: "testBundlePlugin",
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
};

/**
 * This plugin hooks into the build process to print errors in a format that the problem matcher in
 * Visual Studio Code can understand.
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: "esbuild-problem-matcher",

  setup(build) {
    build.onStart(() => {
      console.log("[watch] build started");
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        if (location == null) return;
        console.error(
          `    ${location.file}:${location.line}:${location.column}:`
        );
      });
      console.log("[watch] build finished");
    });
  },
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
