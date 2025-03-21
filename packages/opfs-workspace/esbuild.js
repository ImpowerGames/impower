import { build } from "esbuild";

/** @typedef {import('esbuild').BuildOptions} BuildOptions **/

const args = process.argv.slice(2);
const OUTDIR_ARG = args.find((a) => a.startsWith("--outdir="));
const OUTDIR = OUTDIR_ARG ? OUTDIR_ARG.split("=")?.[1] : "dist";
const PRODUCTION =
  process.env["NODE_ENV"] === "production" || args.includes("--production");

/** @type BuildOptions */
const config = {
  entryPoints: ["./src/opfs-workspace.ts"],
  outdir: OUTDIR,
  bundle: true,
  minify: PRODUCTION,
  sourcemap: !PRODUCTION,
  mainFields: ["module", "main"],
  external: ["commonjs"],
};

(async () => {
  await build(config);
})();
