import * as chokidar from "chokidar";
import * as esbuild from "esbuild";
import path from "path";

/** @typedef {import('esbuild').BuildOptions} BuildOptions **/

const args = process.argv.slice(2);
const OUTDIR_ARG = args.find((a) => a.startsWith("--outdir="));
const OUTDIR = OUTDIR_ARG ? OUTDIR_ARG.split("=")?.[1] : "dist";
const PRODUCTION = process.argv.includes("--production");
const WATCH = process.argv.includes("--watch");

const LOG_PREFIX =
  (WATCH ? "[watch] " : "") + `${path.basename(process.cwd())}: `;

const OPFS_WORKSPACE_SRC_PATH = "../opfs-workspace/src";

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
  entryPoints: ["./src/opfs-workspace.ts"],
  outdir: OUTDIR,
  bundle: true,
  minify: PRODUCTION,
  sourcemap: !PRODUCTION,
  mainFields: ["module", "main"],
  external: ["commonjs"],
  plugins: [esbuildProblemMatcher()],
};

async function main() {
  const ctx = await esbuild.context(config);
  if (WATCH) {
    await ctx.watch();

    const rebuild = async () => {
      console.log(
        LOG_PREFIX +
          `detected change in ${OPFS_WORKSPACE_SRC_PATH}, rebuilding...`
      );
      await ctx.rebuild();
    };

    chokidar
      .watch(OPFS_WORKSPACE_SRC_PATH, {
        ignoreInitial: true,
        persistent: true,
        depth: 99,
      })
      .on("all", rebuild);
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
