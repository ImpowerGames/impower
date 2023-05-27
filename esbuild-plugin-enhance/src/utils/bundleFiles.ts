import fs from "fs";
import generatePureFunction from "./generatePureFunction.js";
import { getFileName } from "./getFileName.js";

const bundleFiles = async (
  path: string,
  transforms?: {
    html?: (data: { html: string; css: string }) => string;
    css?: (data: { html: string; css: string }) => string;
  }
) => {
  const basePath = path.slice(0, path.lastIndexOf("."));
  const htmlPath = basePath + ".html";
  const cssPath = basePath + ".css";
  const fileName = getFileName(path);
  const html = await fs.promises.readFile(htmlPath, "utf-8").catch(() => "");
  const css = await fs.promises.readFile(cssPath, "utf-8").catch(() => "");
  const data = {
    css,
    html,
  };
  const contents = generatePureFunction(fileName, data, transforms);
  return contents;
};

export default bundleFiles;
