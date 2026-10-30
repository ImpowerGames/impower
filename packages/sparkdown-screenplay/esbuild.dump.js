import { build } from "esbuild";
import fs from "fs";
import path from "path";

/** @type {import('esbuild').Plugin} */
const rawPlugin = {
  name: "raw",
  setup(build) {
    build.onResolve({ filter: /\?raw$/ }, (args) => {
      const target = args.path.slice(0, -4);
      return {
        path: path.isAbsolute(target)
          ? target
          : path.join(args.resolveDir, target),
        namespace: "raw-loader",
      };
    });
    build.onLoad({ filter: /.*/, namespace: "raw-loader" }, (args) => ({
      contents: fs.readFileSync(args.path, "utf8"),
      loader: "text",
    }));
  },
};

await build({
  entryPoints: ["./src/cli/dumpTokens.ts"],
  outfile: "./dist/cli/dumpTokens.cjs",
  bundle: true,
  platform: "node",
  target: "node18",
  format: "cjs",
  loader: { ".json": "json" },
  plugins: [rawPlugin],
});
console.log("built");
