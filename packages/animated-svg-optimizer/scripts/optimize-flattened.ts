import fs from "fs";
import path from "path";
import { optimizeFlattenedSVG } from "../src/animated-svg-optimizer.ts";

const [, , inputFolder, outputFolder] = process.argv;

if (!inputFolder) {
  throw new Error("No input folder specified");
}

if (!outputFolder) {
  throw new Error("No output folder specified");
}

const inputFiles = fs.readdirSync(inputFolder);

for (const fileName of inputFiles) {
  if (!fileName.endsWith(".svg")) continue;

  const inputPath = path.join(inputFolder, fileName);
  const outputPath = path.join(outputFolder, fileName);

  try {
    const inputSVG = fs.readFileSync(inputPath, "utf-8");
    const outputSVG = optimizeFlattenedSVG(inputSVG, 1);

    if (!outputSVG) {
      console.error(`❌  Could not flatten: ${inputPath}`);
    } else {
      fs.writeFileSync(outputPath, outputSVG, "utf-8");
      console.log(`✔️  (${outputSVG.length}) Flattened: ${outputPath}`);
    }
  } catch (err) {
    console.error(`❌  Error processing ${fileName}:`, err);
  }
}
