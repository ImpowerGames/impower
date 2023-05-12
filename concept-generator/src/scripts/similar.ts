import cliProgress from "cli-progress";
import fs from "fs";
import { getSimilarPhrases } from "../cli/getSimilarPhrases";

const phrasesPath = "./input/phrases.txt";
const keywordsPath = "./tmp/keywords.json";
const similarPhrasesPath = "./tmp/similarPhrases.ts";

const phrases = fs.readFileSync(phrasesPath, "utf8").split(/\r?\n/);
const keywords = JSON.parse(fs.readFileSync(keywordsPath, "utf8"));

const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
const onProgress = (current: number, total: number) => {
  if (current < 0) {
    bar.start(total, 0);
  }
  if (current === total) {
    bar.stop();
  }
};

const similarPhrases = getSimilarPhrases(phrases.sort(), keywords, onProgress);
const similarPhrasesDefinition =
  "export const similarPhrases: { [phrase: string]: [string, number][] } = ";
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
