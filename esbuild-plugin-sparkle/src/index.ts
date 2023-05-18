import type { Plugin } from "esbuild";
import fs from "fs";
import Graphic from "sparkle-style-transformer/types/graphic.js";
import extractAllGraphics from "sparkle-style-transformer/utils/extractAllGraphics.js";
import generatePureFunction from "./utils/generatePureFunction.js";

const sparklePlugin = (config?: {
  scriptSrcDir?: string;
  patternFiles?: string[];
  iconFiles?: string[];
}): Plugin => {
  return {
    name: "esbuild-plugin-sparkle",
    setup(build) {
      let patterns: Record<string, Graphic> = {};
      let icons: Record<string, Graphic> = {};
      build.onStart(async () => {
        const patternFiles = config?.patternFiles;
        if (patternFiles) {
          for (let i = 0; i < patternFiles.length; i += 1) {
            const patternFile = patternFiles[i] || "";
            const patternsCSS = await fs.promises
              .readFile(patternFile, "utf-8")
              .catch(() => "");
            Object.entries(
              extractAllGraphics("--s-pattern-", patternsCSS)
            ).forEach(([key, value]) => {
              patterns[key] = value;
            });
          }
        }
        const iconFiles = config?.iconFiles;
        if (iconFiles) {
          for (let i = 0; i < iconFiles.length; i += 1) {
            const iconFile = iconFiles[i] || "";
            const iconsCSS = await fs.promises
              .readFile(iconFile, "utf-8")
              .catch(() => "");
            Object.entries(extractAllGraphics("--s-icon-", iconsCSS)).forEach(
              ([key, value]) => {
                icons[key] = value;
              }
            );
          }
        }
      });
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
        const scriptSrcDir = config?.scriptSrcDir;
        const scriptSrc = scriptSrcDir ? `${scriptSrcDir}/${fileName}.mjs` : "";
        const contents = generatePureFunction(fileName, {
          css,
          html,
          scriptSrc,
          patterns,
          icons,
        });
        return {
          contents,
          loader: "js",
        };
      });
    },
  };
};

export default sparklePlugin;
