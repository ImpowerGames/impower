import { Character } from "../types/Character";
import { Chunk } from "../types/Chunk";
import { Phrase } from "../types/Phrase";
import { getStressMatch } from "./getStressMatch";

const getFormattingStress = (
  chunks: Chunk[],
  index: number,
  formatting: "italicized" | "bolded" | "underlined" | "yelled"
): number => {
  const chunk = chunks[index]!;
  const prevChunk = chunks[index - 1];
  const nextChunk = chunks[index + 1];
  const level = chunk[formatting];
  if (level) {
    return level;
  }
  if (chunk.char === " ") {
    const prevLevel = prevChunk?.[formatting];
    if (prevLevel) {
      return prevLevel;
    }
    const nextLevel = nextChunk?.[formatting];
    if (nextLevel) {
      return nextLevel;
    }
  }
  return 0;
};

export const stressPhrases = (
  phrases: Phrase[],
  character: Character | undefined
): void => {
  const lineIncrement = 0.5;
  let lineLevel = (phrases.length - 1) * lineIncrement;
  phrases.forEach((phrase) => {
    const [finalStressType, punctuation] = getStressMatch(
      phrase.text,
      character?.prosody
    );
    const inflection = character?.inflection[
      finalStressType || "statement"
    ] || [0];
    const startLevel = inflection[0]!;
    const endLevel = inflection[inflection.length - 1]!;
    const inflectionSlope = endLevel - startLevel;
    const inflectionDirection = inflectionSlope > 0 ? 1 : -1;
    const phraseLevel = (punctuation.length - 1) * inflectionDirection;
    const chunks = phrase.chunks;

    let inflectionIndex = inflection.length - 1;
    for (let i = chunks.length - 1; i >= 0; i -= 1) {
      const chunk = chunks[i]!;
      const inflectionLevel = inflection[inflectionIndex]!;
      chunk.stressLevel = lineLevel + phraseLevel + inflectionLevel;
      const underlineStressLevel = getFormattingStress(chunks, i, "underlined");
      if (underlineStressLevel) {
        chunk.stressLevel += underlineStressLevel;
      }
      const boldStressLevel = getFormattingStress(chunks, i, "bolded");
      if (boldStressLevel) {
        chunk.stressLevel += boldStressLevel;
      }
      const italicStressLevel = getFormattingStress(chunks, i, "italicized");
      if (italicStressLevel) {
        chunk.stressLevel += italicStressLevel;
      }
      const yelledStressLevel = getFormattingStress(chunks, i, "yelled");
      if (yelledStressLevel) {
        chunk.stressLevel += yelledStressLevel;
      }
      if (chunk.startOfSyllable) {
        inflectionIndex = Math.max(0, inflectionIndex - 1);
      }
    }

    if (phrase.text.endsWith("\n")) {
      // Subsequent lines should either increase or decrease in pitch according to inflection slope.
      lineLevel =
        inflectionSlope > 0
          ? lineLevel + lineIncrement
          : lineLevel - lineIncrement;
    }
  });
};
