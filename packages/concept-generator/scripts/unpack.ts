import fs from "fs";
import YAML from "yaml";
import { getTermTags } from "./utils/getTermTags";

const conceptsPath = "./src/input/concepts.yaml";
const phrasesPath = "./src/input/phrases.txt";
const archetypesPath = "./src/input/archetypes.txt";
const termsPath = "./src/output/terms.json";

const concepts = YAML.parse(fs.readFileSync(conceptsPath, "utf8"));
const phrases = fs.readFileSync(phrasesPath, "utf8").split(/\r?\n/);
const archetypes = fs.readFileSync(archetypesPath, "utf8").split(/\r?\n/);

const result = getTermTags(
  concepts,
  Array.from(new Set([...phrases, ...archetypes]))
);

fs.writeFile(termsPath, JSON.stringify(result, null, 2), (err) => {
  if (err) {
    console.log("FAILED!", err);
  } else {
    console.log("EXPORTED TO: ", termsPath);
  }
});
