import cliProgress from "cli-progress";
import { average, similarity } from "./math";

export const getConceptualExamples = (
  wordVecs: {
    [word: string]: number[];
  },
  ...targetWords: string[]
): string[] => {
  const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);

  const words = Object.keys(wordVecs);

  bar.start(words.length);

  const conceptVecs = targetWords.map((word) => wordVecs[word]);
  const targetConcept = average(conceptVecs);

  if (!targetConcept) {
    throw new Error(`Vector does not exist for: ${targetWords[0]}`);
  }

  const pairs: [string, number][] = [];

  words.forEach((word, index) => {
    bar.update(index);
    const conceptWord = wordVecs[word];
    const sim = similarity(targetConcept, conceptWord);
    pairs.push([word, sim]);
  });

  bar.stop();

  return pairs
    .sort(([, aSim], [, bSim]) => bSim - aSim)
    .slice(0, 30)
    .map(([w]) => w);
};
