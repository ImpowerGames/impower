import fs from "fs";
import path from "path";
import {
  optimizeSVG,
  stripClipPathsFromSVG,
  stripInvisibleRectsFromSVG,
} from "../src/animated-svg-optimizer.ts";

const [, , inputPath, outputPath] = process.argv;

if (!inputPath) {
  throw new Error("No input path specified");
}

if (!outputPath) {
  throw new Error("No output path specified");
}

const inputPaths = path.extname(outputPath)
  ? [inputPath]
  : fs.readdirSync(inputPath).map((file) => path.join(inputPath, file));

for (const inputFilepath of inputPaths) {
  if (inputFilepath.endsWith(".svg")) {
    const inputSVG = fs.readFileSync(inputFilepath, { encoding: "utf-8" });
    const strippedInputSVG = stripClipPathsFromSVG(
      stripInvisibleRectsFromSVG(inputSVG),
    );
    const outputSVG = optimizeSVG(strippedInputSVG, {
      plugins: [
        {
          name: "preset-default",
          params: {
            floatPrecision: 1,
            overrides: {
              cleanupIds: false,
              collapseGroups: false,
            },
          },
        },
      ],
    });
    if (!outputSVG) {
      console.error(`Could not optimize: ${outputPath}`);
    } else {
      const outputFilepath = path.extname(outputPath)
        ? outputPath
        : path.join(outputPath, path.basename(inputFilepath));
      fs.writeFileSync(outputFilepath, outputSVG, "utf-8");
      console.log(
        `✔️  (${outputSVG.length}) Optimized SVG written to: ${outputFilepath}`,
      );
    }
  }
}
