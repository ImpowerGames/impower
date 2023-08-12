import { Character } from "../types/Character";
import { Phrase } from "../types/Phrase";
import { getStressMatch } from "./getStressMatch";

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
    const emphasisScale = punctuation.length;

    let inflectionIndex = inflection.length - 1;
    for (let i = phrase.chunks.length - 1; i >= 0; i -= 1) {
      const chunk = phrase.chunks[i]!;
      const prevChunk = phrase.chunks[i - 1];
      const nextChunk = phrase.chunks[i + 1];
      const inflectionLevel = inflection[inflectionIndex]!;
      chunk.stressLevel = lineLevel + inflectionLevel * emphasisScale;
      if (
        chunk.underlined ||
        (chunk.char === " " && (prevChunk?.underlined || nextChunk?.underlined))
      ) {
        chunk.stressLevel += 1;
      }
      if (
        chunk.bolded ||
        (chunk.char === " " && (prevChunk?.bolded || nextChunk?.bolded))
      ) {
        chunk.stressLevel += 1;
      }
      if (
        chunk.italicized ||
        (chunk.char === " " && (prevChunk?.italicized || nextChunk?.italicized))
      ) {
        chunk.stressLevel += 1;
      }
      if (
        chunk.yelled ||
        (chunk.char === " " && (prevChunk?.yelled || nextChunk?.yelled))
      ) {
        chunk.stressLevel += 1;
      }
      if (chunk.startOfSyllable) {
        inflectionIndex = Math.max(0, inflectionIndex - 1);
      }
    }
    if (phrase.text.endsWith("\n")) {
      // Subsequent lines should either increase or decrease in pitch according to inflection slope.
      const startLevel = inflection[0]!;
      const endLevel = inflection[inflection.length - 1]!;
      const inflectionSlope = endLevel - startLevel;
      lineLevel =
        inflectionSlope > 0
          ? lineLevel + lineIncrement
          : lineLevel - lineIncrement;
    }
  });
};
