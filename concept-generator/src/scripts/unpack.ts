import fs from "fs";
import { parse } from "yaml";
import { getTermTags } from "../utils/getTermTags";

const concepts = parse(fs.readFileSync("./input/concepts.yaml", "utf8"));
const phrases = parse(fs.readFileSync("./input/phrases.yaml", "utf8"));
const archetypes = parse(fs.readFileSync("./input/archetypes.yaml", "utf8"));

const result = getTermTags(
  concepts,
  Array.from(new Set([...phrases, ...archetypes]))
);
const path = "./src/output/terms.json";

fs.writeFile(path, JSON.stringify(result), (err) => {
  if (err) {
    console.log("FAILED!", err);
  } else {
    console.log("EXPORTED TO: ", path);
  }
});
