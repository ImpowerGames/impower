import { build } from "esbuild";

await build({
  entryPoints: ["./src/cli/dumpTokens.ts"],
  outfile: "./dist/cli/dumpTokens.cjs",
  bundle: true,
  platform: "node",
  target: "node18",
  format: "cjs",
  loader: { ".json": "json" },
});
console.log("built");
