import { average, similarity } from "./math";

export const getConceptualExamples = (
  wordVecs: {
    [word: string]: number[];
  },
  targetWords: string[],
  onProgress?: (current: number, total: number) => void
): string[] => {
  const words = Object.keys(wordVecs);

  onProgress?.(-1, words.length);

  const conceptVecs = targetWords.map((word) => wordVecs[word] || []);
  const targetConcept = average(conceptVecs);

  if (!targetConcept) {
    throw new Error(`Vector does not exist for: ${targetWords[0]}`);
  }

  const pairs: [string, number][] = [];

  words.forEach((word, index) => {
    onProgress?.(index, words.length);
    const conceptWord = wordVecs[word] || [];
    const sim = similarity(targetConcept, conceptWord);
    pairs.push([word, sim]);
  });

  const result = pairs
    .sort(([, aSim], [, bSim]) => bSim - aSim)
    .slice(0, 30)
    .map(([w]) => w);

  onProgress?.(words.length, words.length);

  return result;
};
