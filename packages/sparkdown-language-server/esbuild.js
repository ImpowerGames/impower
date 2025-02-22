import { build } from "esbuild";
import fs from "fs";

/** @typedef {import('esbuild').BuildOptions} BuildOptions **/

const args = process.argv.slice(2);
const OUTDIR_ARG = args.find((a) => a.startsWith("--outdir="));
const OUTDIR = OUTDIR_ARG ? OUTDIR_ARG.split("=")?.[1] : "dist";
const PRODUCTION = args.includes("--production");
if (PRODUCTION) {
  process.env["NODE_ENV"] = "production";
}

let compilerInlineWorkerContent = await fs.promises
  .readFile("../sparkdown/dist/sparkdown.js", "utf-8")
  .catch(() => "");

/** @type BuildOptions */
const config = {
  entryPoints: ["./src/sparkdown-language-server.ts"],
  outdir: OUTDIR,
  bundle: true,
  minify: PRODUCTION,
  sourcemap: !PRODUCTION,
  mainFields: ["module", "main"],
  external: ["vscode", "commonjs"],
  banner: {
    js: `
var process = {
  env: {
    COMPILER_INLINE_WORKER: ${JSON.stringify(compilerInlineWorkerContent)}
  }
};
      `.trim(),
  },
  alias: {
    "@lezer/common": "@lezer/common",
  },
};

(async () => {
  await build(config);
})();
