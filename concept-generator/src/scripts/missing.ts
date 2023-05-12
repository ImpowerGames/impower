import fs from "fs";
import { getKeywords } from "../utils/getKeywords";

const archetypesPath = "./src/input/archetypes.txt";
const termsPath = "./output/terms.json";
const missingPath = "./tmp/missing.json";

const archetypes = fs.readFileSync(archetypesPath, "utf8").split(/\r?\n/);
const terms = JSON.parse(fs.readFileSync(termsPath, "utf8"));

const result = getKeywords(archetypes, true);
const missingTerms: string[] = [];
Object.entries(result).forEach(([word]) => {
  if (!(terms as Record<string, string[]>)[word]) {
    missingTerms.push(word);
  }
});
fs.writeFile(missingPath, JSON.stringify(missingTerms.sort()), (err) => {
  if (err) {
    console.log("FAILED!", err);
  } else {
    console.log("EXPORTED TO: ", missingPath);
  }
});
