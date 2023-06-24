import { build } from "esbuild";

const args = process.argv.slice(2);
const OUTDIR_ARG = args.find((a) => a.startsWith("--outdir="));
const OUTDIR = OUTDIR_ARG ? OUTDIR_ARG.split("=")?.[1] : "dist";
const PRODUCTION = args.includes("--production");
if (PRODUCTION) {
  process.env["NODE_ENV"] = "production";
}

(async () => {
  await build({
    entryPoints: ["./src/sparkdown-language-server.ts"],
    outdir: OUTDIR,
    bundle: true,
    minify: PRODUCTION,
    sourcemap: !PRODUCTION,
    mainFields: ["module", "main"],
    external: ["vscode", "commonjs"],
    loader: {
      ".html": "text",
      ".css": "text",
      ".svg": "text",
    },
  });
})();
