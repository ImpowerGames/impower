import cliProgress from "cli-progress";
import fs from "fs";
import readline from "readline";
import { average, similarity } from "../utils/math";

export const getAverageTerms = async (
  threshold = 0.4,
  limit = 100,
  words: string[],
  vector?: number[],
  termVectors?: { [word: string]: number[] }
): Promise<{ related: string[]; vector: number[] }> => {
  const multibar = new cliProgress.MultiBar(
    {
      clearOnComplete: false,
      hideCursor: true,
    },
    cliProgress.Presets.shades_classic
  );

  const vectorCount = 2519371;
  const termVectorEntries = termVectors ? Object.entries(termVectors) : [];

  const progressTotal = termVectorEntries?.length || vectorCount;

  const bar1 = multibar.create(progressTotal, vector ? progressTotal : 0);
  const bar2 = multibar.create(progressTotal, 0);

  const path = "./models/wiki.en.vec";

  let wordVecs: { [word: string]: number[] } = {};

  if (!vector) {
    const fs1 = fs.createReadStream(path);
    const rl1 = readline.createInterface({
      input: fs1,
      crlfDelay: Infinity,
    });

    for await (const line of rl1) {
      bar1.increment();

      const parts = line.split(" ");
      const word = parts[0];
      const wordVec = parts
        .slice(1)
        .map((n) => parseFloat(n))
        .filter((x) => !Number.isNaN(x));
      if (word && words.includes(word)) {
        wordVecs[word] = wordVec;
      }
    }

    rl1.close();
    rl1.removeAllListeners();
  }

  const averageVector = vector || average(Object.values(wordVecs));
  wordVecs = {};

  const relatedWords: [string, number, number][] = [];

  let orderedRelatedWords: string[] = [];

  if (termVectorEntries?.length > 0) {
    termVectorEntries.forEach(([word, wordVec], index) => {
      bar2.increment();

      const sim = similarity(wordVec, averageVector);
      if (!words.includes(word) && sim > threshold) {
        relatedWords.push([word, index, sim]);
      }
    });

    orderedRelatedWords = relatedWords
      .sort(([, , aSim], [, , bSim]) => bSim - aSim)
      .slice(0, limit)
      .map(([word]) => word);
  } else {
    const fs2 = fs.createReadStream(path);
    const rl2 = readline.createInterface({
      input: fs2,
      crlfDelay: Infinity,
    });

    let index = 0;

    for await (const line of rl2) {
      bar2.increment();

      const parts = line.split(" ");
      const word = parts[0];
      const wordVec = parts
        .slice(1)
        .map((n) => parseFloat(n))
        .filter((x) => !Number.isNaN(x));
      const sim = similarity(wordVec, averageVector);
      if (word && !words.includes(word) && sim > threshold) {
        relatedWords.push([word, index, sim]);
      }
      index += 1;
    }

    rl2.close();
    rl2.removeAllListeners();

    orderedRelatedWords = relatedWords
      .sort(([, , aSim], [, , bSim]) => bSim - aSim)
      .slice(0, limit)
      .sort(([, aIndex], [, bIndex]) => aIndex - bIndex)
      .map(([word]) => word);
  }

  multibar.stop();

  return { related: orderedRelatedWords, vector: averageVector };
};
