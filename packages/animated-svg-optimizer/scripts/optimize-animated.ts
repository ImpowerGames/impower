import fs from "fs";
import { optimizeAnimatedSVG } from "../src/animated-svg-optimizer.ts";

const [, , inputPath, outputPath] = process.argv;

if (!inputPath) {
  throw new Error("No input path specified");
}

if (!outputPath) {
  throw new Error("No output path specified");
}

const inputSVG = fs.readFileSync(inputPath, { encoding: "utf-8" });
const outputSVG = optimizeAnimatedSVG(inputSVG, 1, ["fill-rule"]);

if (!outputSVG) {
  console.error(`Could not optimize: ${outputPath}`);
} else {
  fs.writeFileSync(outputPath, outputSVG, "utf-8");
  console.log(
    `✔️ (${outputSVG.length}) Optimized SVG written to: ${outputPath}`
  );
}
