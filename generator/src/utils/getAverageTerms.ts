import cliProgress from "cli-progress";
import fs from "fs";
import readline from "readline";
import { vectorizeTerms } from "./getTagVectors";
import { similarity } from "./math";

export const getAverageTerms = async (
  tagTerms: { [tag: string]: string[] },
  threshold = 0.4,
  limit = 100,
  ...tags: string[]
): Promise<string[]> => {
  const termTags: { [tag: string]: [string, number][] } = {};

  const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);

  const vectorCount = 2519371;

  const targetTags = tags?.length > 0 ? tags : Object.keys(tagTerms);

  const path = "./src/data/wiki.en.vec";

  const wordVecs: { [word: string]: number[] } = {};

  const fs1 = fs.createReadStream(path);
  const rl1 = readline.createInterface({
    input: fs1,
    crlfDelay: Infinity,
  });

  bar.start(vectorCount * 2);

  let i1 = 0;

  for await (const line of rl1) {
    bar.update(i1);
    const parts = line.split(" ");
    const word = parts[0];
    const wordVec = parts.slice(1).map((n) => parseFloat(n));
    if (targetTags.includes(word)) {
      wordVecs[word] = wordVec;
    }
    i1 += 1;
  }

  rl1.close();
  rl1.removeAllListeners();

  const averageVector = vectorizeTerms(targetTags, tagTerms, wordVecs);

  const relatedWords: [string, number][] = [];

  const fs2 = fs.createReadStream(path);
  const rl2 = readline.createInterface({
    input: fs2,
    crlfDelay: Infinity,
  });

  let i2 = 0;

  for await (const line of rl2) {
    bar.update(i1 + i2);
    const parts = line.split(" ");
    const word = parts[0];
    const wordVec = parts.slice(1).map((n) => parseFloat(n));
    const sim = similarity(wordVec, averageVector);
    if (!targetTags.includes(word) && sim > threshold) {
      relatedWords.push([word, sim]);
    }
    i2 += 1;
  }

  rl2.close();
  rl2.removeAllListeners();

  const orderedRelatedWords = relatedWords
    .sort(([, aSim], [, bSim]) => bSim - aSim)
    .slice(0, limit)
    .map(([word]) => word);

  bar.stop();

  console.log(`processed ${i2} vectors`);

  return orderedRelatedWords;
};
