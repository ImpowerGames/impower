const { build } = require("esbuild");
const path = require("path");
//@ts-check
/** @typedef {import('esbuild').BuildOptions} BuildOptions **/

const args = process.argv.slice(2);
const PRODUCTION =
  process.env["NODE_ENV"] === "production" || args.includes("--production");

/** @type BuildOptions */
const screenplayPreviewWebviewConfig = {
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
  entryPoints: ["./screenplay-preview.ts"],
  outfile: "../../out/webviews/screenplay-preview.js",
  alias: {
    "@lezer/common": "@lezer/common",
  },
};

// Build script
(async () => {
  try {
    console.log("build started: screenplay-preview");
    await build(screenplayPreviewWebviewConfig);
    console.log("build finished: screenplay-preview");
  } catch (err) {
    console.err(err);
    process.stderr.write(err.stderr);
    process.exit(1);
  }
})();
