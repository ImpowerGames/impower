import fs from "fs";
import { getKeywords } from "./utils/getKeywords";

const phrasesPath = "./input/phrases.txt";
const keywordsPath = "./tmp/keywords.ts";

const phrases = fs.readFileSync(phrasesPath, "utf8").split(/\r?\n/);

const result = getKeywords(phrases, true);
const definition = "export const keywords: {[word: string]: number} = ";
fs.writeFile(keywordsPath, definition + JSON.stringify(result), (err) => {
  if (err) {
    console.log("FAILED!", err);
  } else {
    console.log("EXPORTED TO: ", keywordsPath);
  }
});
