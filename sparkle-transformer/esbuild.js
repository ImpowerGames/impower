const { build } = require("esbuild");

const entryPoint = "./index.ts";
const outDir = "./dist";
const outFile = `${outDir}/sparkle-transformer.js`;

const cjsConfig = {
  bundle: true,
  platform: "node",
  target: "es2020",
  format: "cjs",
  entryPoints: [entryPoint],
  outfile: outFile,
};

(async () => {
  try {
    await build({
      ...cjsConfig,
    });
    console.log("build complete");
  } catch (err) {
    process.stderr.write(err.stderr);
    process.exit(1);
  }
})();
