import fs from "fs";
import { parse } from "yaml";
import { getKeywords } from "../utils/getKeywords";
import { getRelatedTerms } from "../utils/getRelatedTerms";

const concepts = parse(fs.readFileSync("./input/concepts.yaml", "utf8"));
const phrases = fs.readFileSync("./input/phrases.txt", "utf8").split(/\r?\n/);
const archetypes = fs
  .readFileSync("./input/archetypes.txt", "utf8")
  .split(/\r?\n/);
const json = fs.readFileSync("./tmp/termVectors.json", "utf8");
const termVectors = JSON.parse(json);

getRelatedTerms(
  concepts,
  termVectors,
  Object.keys(getKeywords([...phrases, ...archetypes])),
  0.4,
  4,
  ...process.argv.slice(2)
).then((result) => {
  const path = "./tmp/relatedTerms.json";

  fs.writeFile(path, JSON.stringify(result), (err) => {
    if (err) {
      console.log("FAILED!", err);
    } else {
      console.log("EXPORTED TO: ", path);
    }
  });
});
