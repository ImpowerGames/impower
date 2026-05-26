import { build } from "esbuild";

await build({
  entryPoints: ["./src/cli/buildPdfCli.ts"],
  outfile: "./dist/cli/buildPdfCli.cjs",
  bundle: true,
  platform: "node",
  target: "node18",
  format: "cjs",
  sourcemap: true,
  loader: {
    ".ttf": "binary",
    ".json": "json",
  },
  banner: { js: "#!/usr/bin/env node" },
  external: [],
});
console.log("built dist/cli/buildPdfCli.cjs");
