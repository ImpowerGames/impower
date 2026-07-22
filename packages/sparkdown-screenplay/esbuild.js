import { build } from "esbuild";
import fs from "fs";
import path from "path";

/**
 * Honor Vite's `?raw` query in esbuild: resolve a `*?raw` import to the real
 * file in a dedicated namespace, then load its contents as a text string.
 * Gives esbuild parity with Vite/vitest (which support `?raw` natively) so the
 * same `import text from "./some.file?raw"` works in code bundled by either.
 * @type {import('esbuild').Plugin}
 */
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
  entryPoints: ["./src/cli/readingCopy.ts"],
  outfile: "./dist/cli/readingCopy.cjs",
  bundle: true,
  platform: "node",
  target: "node18",
  format: "cjs",
  sourcemap: true,
  loader: { ".json": "json" },
  banner: { js: "#!/usr/bin/env node" },
  plugins: [rawPlugin],
});
console.log("built dist/cli/readingCopy.cjs");

await build({
  entryPoints: ["./src/cli/dumpAllTokens.ts"],
  outfile: "./dist/cli/dumpAllTokens.cjs",
  bundle: true,
  platform: "node",
  target: "node18",
  format: "cjs",
  sourcemap: true,
  loader: { ".json": "json" },
  banner: { js: "#!/usr/bin/env node" },
  plugins: [rawPlugin],
});
console.log("built dist/cli/dumpAllTokens.cjs");

await build({
  entryPoints: ["./src/cli/dumpFixtureTokens.ts"],
  outfile: "./dist/cli/dumpFixtureTokens.cjs",
  bundle: true,
  platform: "node",
  target: "node18",
  format: "cjs",
  sourcemap: true,
  loader: { ".json": "json" },
  banner: { js: "#!/usr/bin/env node" },
  plugins: [rawPlugin],
});
console.log("built dist/cli/dumpFixtureTokens.cjs");
