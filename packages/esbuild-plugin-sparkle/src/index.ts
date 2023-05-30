import enhanceSetup from "@impower/esbuild-plugin-enhance/utils/enhanceSetup.js";
import Graphic from "@impower/sparkle-style-transformer/types/graphic.js";
import extractAllGraphics from "@impower/sparkle-style-transformer/utils/extractAllGraphics.js";
import generateStyledHtml from "@impower/sparkle-style-transformer/utils/generateStyledHtml.js";
import type { Plugin } from "esbuild";
import fs from "fs";

const sparklePlugin = (config?: {
  componentPrefix?: string;
  fallbackCSS?: string;
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
      const transforms = {
        html: (data: { html: string }) =>
          generateStyledHtml(data?.html, { patterns, icons }),
        css: (data: { css: string }) => data.css || config?.fallbackCSS || "",
      };
      const componentPrefix = config?.componentPrefix;
      enhanceSetup(build, transforms, componentPrefix);
    },
  };
};

export default sparklePlugin;
