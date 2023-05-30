import { Word } from "../types/Word";

export const stressWord = (
  word: Word,
  contour: number[],
  durationMultiplier: number = 1
): void => {
  const validContourLength = Math.max(1, contour.length);
  if (word.syllables.length < contour.length) {
    const combinedChunks = word.syllables.flatMap((s) => s.chunks);
    // Split word into enough syllables so that there is one syllable per final contour index
    const originalSyllableCount = word.syllables.length;
    const newSyllableCount = validContourLength;
    const divisionChunkLength = Math.round(word.text.length / newSyllableCount);
    const splitDurationMultiplier = newSyllableCount / originalSyllableCount;
    let contourIndex = 0;
    combinedChunks.forEach((c, i) => {
      if (c.voiced) {
        c.duration *= splitDurationMultiplier * durationMultiplier;
      }
      c.stressLevel = contour[contourIndex];
      if (i % divisionChunkLength === 0 && c.voiced) {
        c.startOfSyllable = true;
        contourIndex += 1;
      } else {
        c.startOfSyllable = false;
      }
    });
  } else {
    const max = Math.max(1, word.syllables.length - 1);
    word.syllables.forEach((s, i) => {
      const progress = i / max;
      s.chunks.forEach((c) => {
        const contourIndex = Math.floor(progress * (validContourLength - 1));
        if (c.voiced) {
          c.duration *= durationMultiplier;
        }
        c.stressLevel = contour[contourIndex];
      });
    });
  }
};
