import type { Plugin } from "esbuild";
import enhanceSetup from "./utils/enhanceSetup.js";

const enhancePlugin = (
  transforms?: {
    html?: (data: { html: string; css: string }) => string;
    css?: (data: { html: string; css: string }) => string;
  },
  componentPrefix?: string
): Plugin => {
  return {
    name: "esbuild-plugin-enhance",
    setup(build) {
      enhanceSetup(build, transforms, componentPrefix);
    },
  };
};

export default enhancePlugin;
