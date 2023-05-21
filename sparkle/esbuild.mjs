import { build } from "esbuild";
import sparklePlugin from "esbuild-plugin-sparkle";
import fs from "fs";

//@ts-check
/** @typedef {import('esbuild').BuildOptions} BuildOptions **/

const PATTERNS_CSS = "./src/styles/patterns/patterns.css";
const ICONS_CSS = "./src/styles/icons/icons.css";

const OUT_DIR = "./functions";
const ENTRY_COMPONENTS_DIR = "./src/components";
const ENTRY_STYLES_DIR = "./src/styles";

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

const componentsTS = fs
  .readdirSync(ENTRY_COMPONENTS_DIR)
  .map((name) => `${ENTRY_COMPONENTS_DIR}/${name}/${name}`)
  .map((p) => `${p}.ts`);
const stylesCSS = fs
  .readdirSync(ENTRY_STYLES_DIR)
  .map((name) => `${ENTRY_STYLES_DIR}/${name}/${name}.css`);

/** @type BuildOptions */
const mjsBundlesConfig = {
  bundle: true,
  format: "esm",
  target: "es2020",
  platform: "browser",
  entryNames: "[name]",
  outExtension: { ".js": ".mjs" },
  outdir: `${OUT_DIR}`,
  entryPoints: [...componentsTS, ...stylesCSS],
  plugins: [
    sparklePlugin({
      componentPrefix: "s-",
      patternFiles: [PATTERNS_CSS],
      iconFiles: [ICONS_CSS],
    }),
  ],
};

// Build script
(async () => {
  try {
    console.log("build started");
    await build(mjsBundlesConfig);
    console.log("build finished");
  } catch (err) {
    process.stderr.write(err.stderr);
    process.exit(1);
  }
})();
