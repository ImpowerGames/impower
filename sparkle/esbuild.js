const { build } = require("esbuild");
const { execSync } = require("child_process");
const fs = require("fs");
const {
  sparkleTransformerPlugin,
} = require(`../sparkle-transformer/dist/sparkle-transformer.js`);

const bundlesDir = "./bundles";
const componentsDir = "./src/components";
const stylesDir = "./src/styles";
const patternsCSS = "./src/styles/patterns/patterns.css";
const iconsCSS = "./src/styles/icons/icons.css";

const patternFiles = [patternsCSS];
const iconFiles = [iconsCSS];

fs.rmSync(bundlesDir, { recursive: true, force: true });
fs.mkdirSync(bundlesDir, { recursive: true });

const components = fs
  .readdirSync(componentsDir)
  .map((name) => `${componentsDir}/${name}/${name}.html`);
const styles = fs
  .readdirSync(stylesDir)
  .map((name) => `${stylesDir}/${name}/${name}.css`);

const bundleConfig = {
  bundle: true,
  format: "esm",
  target: "es2020",
  platform: "browser",
  loader: {
    ".html": "text",
    ".css": "text",
    ".svg": "text",
  },
  entryPoints: [...components, ...styles],
  plugins: [sparkleTransformerPlugin({ patternFiles, iconFiles })],
  outdir: `${bundlesDir}`,
  outExtension: { ".js": ".mjs" },
};

// Build script
(async () => {
  try {
    execSync(`cem analyze --outdir "./"`, {
      stdio: "inherit",
    });
    // Build node code
    await build({
      ...bundleConfig,
    });
    console.log("build complete");
  } catch (err) {
    process.stderr.write(err.stderr);
    process.exit(1);
  }
})();
