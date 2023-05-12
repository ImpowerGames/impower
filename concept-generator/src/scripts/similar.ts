import fs from "fs";
import phrases from "../input/phrases.json";
import { getSimilarPhrases } from "../utils/getSimilarPhrases";

const json = fs.readFileSync("./tmp/keywords.json", "utf8");
const keywords = JSON.parse(json);

const similarPhrases = getSimilarPhrases(phrases.sort(), keywords);
const similarPhrasesDefinition =
  "export const similarPhrases: { [phrase: string]: [string, number][] } = ";
const similarPhrasesPath = "./tmp/similarPhrases.ts";
fs.writeFile(
  similarPhrasesPath,
  similarPhrasesDefinition + JSON.stringify(similarPhrases),
  (err) => {
    if (err) {
      console.log("FAILED!", err);
    } else {
      console.log("EXPORTED TO: ", similarPhrasesPath);
    }
  }
);
