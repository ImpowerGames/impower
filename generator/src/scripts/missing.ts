import fs from "fs";
import archetypes from "../../../client/resources/json/en/archetypes.json";
import terms from "../output/terms.json";
import { getKeywords } from "../utils/getKeywords";

const result = getKeywords(archetypes, true);
const missingTerms: string[] = [];
Object.entries(result).forEach(([word, count]) => {
  if (!terms[word]) {
    missingTerms.push(word);
  }
});
const path = "./src/tmp/missing.json";
fs.writeFile(path, JSON.stringify(missingTerms.sort()), (err) => {
  if (err) {
    console.log("FAILED!", err);
  } else {
    console.log("EXPORTED TO: ", path);
  }
});
