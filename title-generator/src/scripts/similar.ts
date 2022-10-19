import fs from "fs";
import phrases from "../input/phrases.json";
import { keywords } from "../generated/keywords";
import { getSimilarPhrases } from "../utils/getSimilarPhrases";

const similarPhrases = getSimilarPhrases(phrases.sort(), keywords);
const similarPhrasesDefinition =
  "export const similarPhrases: { [phrase: string]: [string, number][] } = ";
const similarPhrasesPath = "./src/tmp/similarPhrases.ts";
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
