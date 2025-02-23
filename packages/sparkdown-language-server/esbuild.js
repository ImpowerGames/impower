import { build } from "esbuild";
import { exec } from "child_process";
import fs from "fs";

/** @typedef {import('esbuild').BuildOptions} BuildOptions **/

const args = process.argv.slice(2);
const OUTDIR_ARG = args.find((a) => a.startsWith("--outdir="));
const OUTDIR = OUTDIR_ARG ? OUTDIR_ARG.split("=")?.[1] : "dist";
const PRODUCTION =
  process.env["NODE_ENV"] === "production" || args.includes("--production");

(async () => {
  await new Promise((resolve) => {
    exec(
      `npm run build:workers:${PRODUCTION ? "prod" : "dev"}`,
      (error, stdout, stderr) => {
        if (error) {
          console.error(error);
        }
        if (stdout) {
          console.log(stdout);
        }
        if (stderr) {
          console.error(stderr);
        }
        resolve();
      }
    );
  });
  let compilerInlineWorkerContent = await fs.promises
    .readFile("../sparkdown/dist/sparkdown.js", "utf-8")
    .catch((e) => {
      console.error(e);
    });
  /** @type BuildOptions */
  const config = {
    entryPoints: ["./src/sparkdown-language-server.ts"],
    outdir: OUTDIR,
    bundle: true,
    minify: PRODUCTION,
    sourcemap: !PRODUCTION,
    mainFields: ["module", "main"],
    external: ["vscode", "commonjs"],
    banner: {
      js: `
  var process = {
    env: {
      COMPILER_INLINE_WORKER: ${JSON.stringify(compilerInlineWorkerContent)}
    }
  };`.trim(),
    },
    alias: {
      "@lezer/common": "@lezer/common",
    },
  };
  await build(config);
})();
