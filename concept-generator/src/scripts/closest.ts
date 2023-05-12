import fs from "fs";
import { parse } from "yaml";
import { getClosestTags } from "../utils/getClosestTags";

const concepts = parse(fs.readFileSync("./input/concepts.yaml", "utf8"));
const json = fs.readFileSync("./tmp/termVectors.json", "utf8");
const termVectors = JSON.parse(json);

const result = getClosestTags(
  concepts,
  termVectors,
  Number.parseInt(process.argv[2] || "5"),
  ...process.argv.slice(3)
);
console.log(result);
