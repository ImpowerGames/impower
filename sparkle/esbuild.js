const { build } = require("esbuild");
const { copy } = require("esbuild-plugin-copy");
const { execSync } = require("child_process");
const fs = require("fs");

//@ts-check
/** @typedef {import('esbuild').BuildOptions} BuildOptions **/

/** @type BuildOptions */
const baseConfig = {
  bundle: true,
  minify: process.env.NODE_ENV === "production",
  sourcemap: process.env.NODE_ENV !== "production",
};

const outdir = "./dist";

// Config for code that is run in a web-based context
/** @type BuildOptions */
const webConfig = {
  ...baseConfig,
  target: "es2020",
  format: "esm",
  loader: {
    ".html": "text",
    ".css": "text",
    ".svg": "text",
  },
  entryPoints: ["./index.ts"],
  outfile: `${outdir}/sparkle.js`,
  plugins: [
    // Copy css and ttf files to out directory unaltered
    copy({
      resolveFrom: "cwd",
      assets: {
        from: ["./src/assets/**"],
        to: [outdir],
      },
    }),
  ],
};

// This watch config adheres to the conventions of the esbuild-problem-matchers
// extension (https://github.com/connor4312/esbuild-problem-matchers#esbuild-via-js)
/** @type BuildOptions */
const watchConfig = {
  watch: {
    onRebuild(error, result) {
      console.log("[watch] build started");
      if (error) {
        error.errors.forEach((error) =>
          console.error(
            `> ${error.location.file}:${error.location.line}:${error.location.column}: error: ${error.text}`
          )
        );
      } else {
        console.log("[watch] build finished");
      }
    },
  },
};

fs.rmSync(outdir, { recursive: true, force: true });
fs.mkdirSync(outdir, { recursive: true });

// Build script
(async () => {
  const args = process.argv.slice(2);
  try {
    execSync(`cem analyze --outdir "${outdir}"`, {
      stdio: "inherit",
    });
    if (args.includes("--watch")) {
      // Build and watch web code
      console.log("[watch] build started");
      await build({
        ...watchConfig,
      });
      await build({
        ...webConfig,
        ...watchConfig,
      });
      console.log("[watch] build finished");
    } else {
      // Build web code
      await build(webConfig);
      console.log("build complete");
    }
  } catch (err) {
    process.stderr.write(err.stderr);
    process.exit(1);
  }
})();
