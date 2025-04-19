import { context } from "esbuild";
import path from "path";

/** @typedef {import('esbuild').BuildOptions} BuildOptions **/

const args = process.argv.slice(2);
const OUTDIR_ARG = args.find((a) => a.startsWith("--outdir="));
const OUTDIR = OUTDIR_ARG ? OUTDIR_ARG.split("=")?.[1] : "dist";
const PRODUCTION = process.argv.includes("--production");
const WATCH = process.argv.includes("--watch");

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
          `    ${location.file}:${location.line}:${location.column}:`
        );
      });
      console.log(LOG_PREFIX + `build finished`);
    });
  },
});

/** @type BuildOptions */
const config = {
  entryPoints: ["./src/sparkdown-screenplay-pdf.ts"],
  outdir: OUTDIR,
  bundle: true,
  minify: PRODUCTION,
  sourcemap: !PRODUCTION,
  mainFields: ["module", "main"],
  external: ["commonjs"],
  loader: {
    ".ttf": "binary",
  },
  alias: {
    buffer: "buffer",
    fs: "browserify-fs",
    assert: "assert",
    os: "os-browserify",
    path: "path-browserify",
    stream: "stream-browserify",
    zlib: "browserify-zlib",
    util: "util",
    "@lezer/common": "@lezer/common",
  },
  inject: [path.resolve(process.cwd(), "./src/shims/node.js")],
  banner: {
    js: `
if (typeof window !== "undefined") { window.global = {}; };
if (typeof self !== "undefined") { self.global = {}; };
`.trim(),
  },
  plugins: [esbuildProblemMatcher()],
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
