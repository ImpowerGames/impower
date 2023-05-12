import { difference, similarity } from "./math";

export const getConceptualDifference = (
  targetWord: string,
  otherWord: string,
  wordVecs: {
    [word: string]: number[];
  },
  depth = 30,
  onProgress?: (current: number, total: number) => void
): string[] => {
  const words = Object.keys(wordVecs);

  onProgress?.(-1, words.length);

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
    onProgress?.(index, words.length);
    const conceptWord = wordVecs[word];
    const sim = similarity(diff, conceptWord || []);
    pairs.push([word, sim]);
  });

  const result = pairs
    .sort(([, aSim], [, bSim]) => bSim - aSim)
    .slice(0, depth)
    .map(([w]) => w);

  onProgress?.(words.length, words.length);

  return result;
};
