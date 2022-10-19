import cliProgress from "cli-progress";
import { difference, similarity } from "./math";

export const getConceptualDifference = (
  targetWord: string,
  otherWord: string,
  wordVecs: {
    [word: string]: number[];
  },
  depth = 30
): string[] => {
  const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);

  const words = Object.keys(wordVecs);

  bar.start(words.length, 0);

  const targetConcept = wordVecs[targetWord];
  const otherConcept = wordVecs[otherWord];

  if (!targetConcept) {
    throw new Error(`Vector does not exist for: ${targetWord}`);
  }

  if (!otherConcept) {
    throw new Error(`Vector does not exist for: ${otherConcept}`);
  }

  const diff = difference(targetConcept, otherConcept);
  const pairs: [string, number][] = [];

  words.forEach((word, index) => {
    bar.update(index);
    const conceptWord = wordVecs[word];
    const sim = similarity(diff, conceptWord || []);
    pairs.push([word, sim]);
  });

  bar.stop();

  return pairs
    .sort(([, aSim], [, bSim]) => bSim - aSim)
    .slice(0, depth)
    .map(([w]) => w);
};
