import fs from "fs";
import { parse } from "yaml";
import { getTermTags } from "./utils/getTermTags";

const conceptsPath = "./input/concepts.yaml";
const phrasesPath = "./input/phrases.txt";
const archetypesPath = "./input/archetypes.txt";
const termsPath = "./src/output/terms.json";

const concepts = parse(fs.readFileSync(conceptsPath, "utf8"));
const phrases = fs.readFileSync(phrasesPath, "utf8").split(/\r?\n/);
const archetypes = fs.readFileSync(archetypesPath, "utf8").split(/\r?\n/);

const result = getTermTags(
  concepts,
  Array.from(new Set([...phrases, ...archetypes]))
);

fs.writeFile(termsPath, JSON.stringify(result), (err) => {
  if (err) {
    console.log("FAILED!", err);
  } else {
    console.log("EXPORTED TO: ", termsPath);
  }
});
