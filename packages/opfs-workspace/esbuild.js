import * as esbuild from "esbuild";
import fs from "fs";
import path from "path";

/** @typedef {import('esbuild').BuildOptions} BuildOptions **/

/**
 * Honor Vite's `?raw` query in esbuild: resolve a `*?raw` import to the real
 * file in a dedicated namespace, then load its contents as a text string.
 * Gives esbuild parity with Vite/vitest (which support `?raw` natively) so the
 * same `import text from "./some.file?raw"` works in code bundled by either.
 * @type {import('esbuild').Plugin}
 */
const rawPlugin = {
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
};

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
          `    ${location.file}:${location.line}:${location.column}:`,
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
  plugins: [rawPlugin, esbuildProblemMatcher()],
};

async function main() {
  const ctx = await esbuild.context(config);
  if (WATCH) {
    // esbuild's native watch already tracks this worker's full input graph —
    // its own src AND its @impower deps (imported via /src/ subpaths, so they
    // resolve to source). The old extra chokidar on its OWN src was redundant
    // and, lacking error handling, crashed the whole watcher on any build error
    // (e.g. a syntax error mid-edit) — silently ending hot-reload.
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
