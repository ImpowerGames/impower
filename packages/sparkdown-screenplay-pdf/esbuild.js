import { build } from "esbuild";
import path from "path";

/** @typedef {import('esbuild').BuildOptions} BuildOptions **/

const args = process.argv.slice(2);
const OUTDIR_ARG = args.find((a) => a.startsWith("--outdir="));
const OUTDIR = OUTDIR_ARG ? OUTDIR_ARG.split("=")?.[1] : "dist";
const PRODUCTION = args.includes("--production");
if (PRODUCTION) {
  process.env["NODE_ENV"] = "production";
}

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
  },
  inject: [path.resolve(process.cwd(), "./src/shims/node.js")],
  banner: {
    js: `
if (typeof window !== "undefined") { window.global = {}; };
if (typeof self !== "undefined") { self.global = {}; };
`.trim(),
  },
};

(async () => {
  await build(config);
})();
