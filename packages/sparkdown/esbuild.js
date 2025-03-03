import { context } from "esbuild";

const args = process.argv.slice(2);
const OUTDIR_ARG = args.find((a) => a.startsWith("--outdir="));
const OUTDIR = OUTDIR_ARG ? OUTDIR_ARG.split("=")?.[1] : "dist";
const PRODUCTION = process.argv.includes("--production");
const WATCH = process.argv.includes("--watch");

/** @type {import('esbuild').Plugin} **/
const esbuildProblemMatcher = () => ({
  name: "esbuildProblemMatcher",
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
});

/** @type {import('esbuild').BuildOptions} BuildOptions **/
const config = {
  entryPoints: ["./src/sparkdown.ts"],
  outdir: OUTDIR,
  bundle: true,
  minify: PRODUCTION,
  sourcemap: !PRODUCTION,
  mainFields: ["module", "main"],
  external: ["commonjs"],
  alias: {
    "@codemirror/state": "@codemirror/state",
    "@lezer/common": "@lezer/common",
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
