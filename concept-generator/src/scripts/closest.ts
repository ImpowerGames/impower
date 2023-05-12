import fs from "fs";
import { parse } from "yaml";
import { getClosestTags } from "../utils/getClosestTags";

const conceptsPath = "./src/input/concepts.yaml";
const termVectorsPath = "./tmp/termVectors.json";

const concepts = parse(fs.readFileSync(conceptsPath, "utf8"));
const termVectors = JSON.parse(fs.readFileSync(termVectorsPath, "utf8"));

const result = getClosestTags(
  concepts,
  termVectors,
  Number.parseInt(process.argv[2] || "5"),
  ...process.argv.slice(3)
);
console.log(result);
