const { context } = require("esbuild");

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
  bundle: true,
  minify: PRODUCTION,
  sourcemap: !PRODUCTION,
  loader: {
    ".html": "text",
    ".css": "text",
    ".svg": "text",
  },
  target: "es2020",
  platform: "browser",
  format: "esm",
  entryPoints: ["./game-webview.ts"],
  outfile: "../../out/webviews/game-webview.js",
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
