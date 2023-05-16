import type { Plugin } from "esbuild";
import fs from "node:fs";
import { generatePureFunction } from "./src/utils/generatePureFunction";

export const sparkleTransformerPlugin = (): Plugin => {
  return {
    name: "sparkle-transformer",
    setup(build) {
      build.onLoad({ filter: /.+$/ }, async (args) => {
        const basePath = args.path.slice(0, args.path.lastIndexOf("."));
        const htmlPath = basePath + ".html";
        const cssPath = basePath + ".css";
        const fileName = basePath.slice(basePath.lastIndexOf("\\") + 1);
        const html = await fs.promises
          .readFile(htmlPath, "utf-8")
          .catch(() => "");
        const css = await fs.promises
          .readFile(cssPath, "utf-8")
          .catch(() => "");
        const contents = generatePureFunction(fileName, { html, css });
        return {
          contents,
          loader: "js",
        };
      });
    },
  };
};
