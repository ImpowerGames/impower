import { compile } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";
import fs from "fs";
import path from "path";

/** @returns {import('esbuild').Plugin} */
export const tailwindLoader = (inputs) => ({
  name: "tailwind-loader",
  setup(build) {
    build.onStart(() => {
      inputs.clear();
    });
    build.onResolve({ filter: /\?tw$/ }, (args) => ({
      path: path.resolve(args.resolveDir, args.path.replace(/\?tw$/, "")),
      namespace: "tailwind-loader",
    }));
    build.onLoad({ filter: /.*/, namespace: "tailwind-loader" }, async (args) => {
      const input = await fs.promises.readFile(args.path, "utf8");
      const base = path.dirname(args.path);
      const watchFiles = [args.path];
      const compiler = await compile(input, {
        base,
        onDependency: (file) => watchFiles.push(file),
      });
      const scanner = new Scanner({ sources: compiler.sources });
      const css = compiler.build(scanner.scan());
      for (const file of watchFiles) inputs.add(file);
      return { contents: `export default ${JSON.stringify(css)};`, watchFiles };
    });
  },
});
