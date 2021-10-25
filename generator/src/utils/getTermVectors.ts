import fs from "fs";
import readline from "readline";
import { vectorizeTag } from "./getTagVectors";

export const getTermVectors = async (
  tagTerms: { [tag: string]: string[] },
  include: (word: string) => boolean
) => {
  const path = "./src/data/wiki.en.vec";
  const fileStream = fs.createReadStream(path);

  const wordVecs: { [word: string]: number[] } = {};

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const parts = line.split(" ");
    const word = parts[0];
    const vector = parts.slice(1).map((n) => parseFloat(n));
    if (include(word)) {
      wordVecs[word] = vector;
    }
  }

  const tagVecs: { [tag: string]: number[] } = {};
  Object.keys(tagTerms).forEach((tag) => {
    tagVecs[tag] = vectorizeTag(tag, tagTerms, wordVecs);
  });

  return wordVecs;
};
