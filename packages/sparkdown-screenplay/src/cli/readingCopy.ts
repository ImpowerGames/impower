import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import ScreenplayParser from "../classes/ScreenplayParser";
import { generateScreenplayReadingCopy } from "../utils/generateScreenplayReadingCopy";

const usage = () => {
  console.error("Usage: reading-copy <input.sd> <output.md>");
  process.exit(1);
};

const args = process.argv.slice(2);
if (args.length !== 2) usage();
const [inputArg, outputArg] = args as [string, string];

const inputPath = resolve(process.cwd(), inputArg);
const outputPath = resolve(process.cwd(), outputArg);

const script = readFileSync(inputPath, "utf8");
const tokens = new ScreenplayParser().parse(script);
const readingCopy = generateScreenplayReadingCopy(tokens);
writeFileSync(outputPath, readingCopy, "utf8");
console.log(`Wrote ${outputPath} (${readingCopy.length} bytes)`);
