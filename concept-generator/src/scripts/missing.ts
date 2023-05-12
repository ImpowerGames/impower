import fs from "fs";
import archetypes from "../input/archetypes.json";
import terms from "../output/terms.json";
import { getKeywords } from "../utils/getKeywords";

const result = getKeywords(archetypes, true);
const missingTerms: string[] = [];
Object.entries(result).forEach(([word]) => {
  if (!(terms as Record<string, string[]>)[word]) {
    missingTerms.push(word);
  }
});
const path = "./tmp/missing.json";
fs.writeFile(path, JSON.stringify(missingTerms.sort()), (err) => {
  if (err) {
    console.log("FAILED!", err);
  } else {
    console.log("EXPORTED TO: ", path);
  }
});
