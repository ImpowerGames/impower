import { build } from "esbuild";

await build({
  entryPoints: ["./src/cli/readingCopy.ts"],
  outfile: "./dist/cli/readingCopy.cjs",
  bundle: true,
  platform: "node",
  target: "node18",
  format: "cjs",
  sourcemap: true,
  loader: { ".json": "json" },
  banner: { js: "#!/usr/bin/env node" },
});
console.log("built dist/cli/readingCopy.cjs");
