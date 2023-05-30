import type { PluginBuild } from "esbuild";
import fs from "fs";
import bundleFiles from "./bundleFiles.js";
import { convertToPascalCase } from "./convertToPascalCase.js";
import { getFileName } from "./getFileName.js";

const getImport = (path: string) => {
  const fileName = getFileName(path);
  const constructorName = convertToPascalCase(fileName);
  return `import ${constructorName} from "./${fileName}.mjs";`;
};

const getMapEntry = (path: string, componentPrefix?: string) => {
  const fileName = getFileName(path);
  const constructorName = convertToPascalCase(fileName);
  const prefix = componentPrefix || "";
  const tagName = `${prefix}${fileName}`.toLowerCase();
  return `  "${tagName}": ${constructorName},`;
};

const enhanceSetup = (
  build: PluginBuild,
  transforms?: {
    html?: (data: { html: string; css: string }) => string;
    css?: (data: { html: string; css: string }) => string;
  },
  componentPrefix?: string
): void => {
  const options = build.initialOptions;
  options.write = false;
  (options.entryNames = "[name]"),
    build.onLoad({ filter: /.+$/ }, async (args) => {
      const contents = await bundleFiles(args.path, transforms);
      return {
        contents,
        loader: "js",
      };
    });
  build.onEnd(async (result) => {
    const files = result.outputFiles;
    if (files) {
      const imports = files.map((file) => getImport(file.path));
      const elementsStart = `const elements = {`;
      const elements = files.map((file) =>
        getMapEntry(file.path, componentPrefix)
      );
      const elementsEnd = `};`;
      const importsChunk = imports.join("\n");
      const elementsChunk = [elementsStart, ...elements, elementsEnd].join(
        "\n"
      );
      const exportChunk = `export default elements;`;
      const indexContents = [importsChunk, elementsChunk, exportChunk].join(
        "\n\n"
      );
      await Promise.all(
        files.map(async (file) => {
          await fs.promises.writeFile(file.path, file.text, "utf-8");
        })
      );
      const indexPath = `${options.outdir}/index.mjs`;
      await fs.promises.writeFile(indexPath, indexContents, "utf-8");
    }
  });
};

export default enhanceSetup;
