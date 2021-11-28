import fs from "fs";
import terms from "../output/terms.json";
import words from "../tmp/words.json";
import { getKeywords } from "../utils/getKeywords";

const result = getKeywords(words, true);
const missingTerms: { [word: string]: number } = {};
Object.entries(result).forEach(([word, count]) => {
  if (!terms[word]) {
    missingTerms[word] = count;
  }
});
const path = "./src/tmp/missing.json";
fs.writeFile(path, JSON.stringify(missingTerms), (err) => {
  if (err) {
    console.log("FAILED!", err);
  } else {
    console.log("EXPORTED TO: ", path);
  }
});
