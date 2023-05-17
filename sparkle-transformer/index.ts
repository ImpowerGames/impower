import type { Plugin } from "esbuild";
import fs from "node:fs";
import { Graphic } from "./src/types/graphic";
import { extractAllGraphics } from "./src/utils/extractAllGraphics";
import { generatePureFunction } from "./src/utils/generatePureFunction";

export const sparkleTransformerPlugin = (config: {
  patternFiles: string[];
  iconFiles: string[];
}): Plugin => {
  return {
    name: "sparkle-transformer",
    setup(build) {
      let patterns: Record<string, Graphic> = {};
      let icons: Record<string, Graphic> = {};
      build.onStart(async () => {
        console.log("build started");
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
        const contents = generatePureFunction(fileName, {
          html,
          css,
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
