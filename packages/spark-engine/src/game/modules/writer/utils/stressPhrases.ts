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
  if (chunk.text === " ") {
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
  const stressLevelIncrement = 0.5;
  const lineIncrement = 0.5;
  // Speaker starts at max pitch and ends at their natural speaking pitch once arriving at the point of their speech.
  let lineLevel = (phrases.length - 1) * lineIncrement;
  phrases.forEach((phrase) => {
    if (phrase.text) {
      const chunks = phrase.chunks;
      if (chunks) {
        const [finalStressType, punctuation] = getStressMatch(
          phrase.text,
          character?.prosody
        );
        const inflection = character?.inflection?.[
          finalStressType || "statement"
        ] || [0];
        const startLevel = inflection[0]!;
        const endLevel = inflection[inflection.length - 1]!;
        const inflectionSlope = endLevel - startLevel;
        const inflectionDirection = inflectionSlope > 0 ? 1 : -1;
        const phraseLevel = (punctuation.length - 1) * inflectionDirection;

        let inflectionIndex = inflection.length - 1;
        for (let i = chunks.length - 1; i >= 0; i -= 1) {
          const chunk = chunks[i]!;
          // Automatically infer appropriate pitch from inflection type and stress formatting
          const inflectionLevel = inflection[inflectionIndex]!;
          chunk.pitch =
            (chunk.pitch ?? 0) + lineLevel + phraseLevel + inflectionLevel;
          const underlineStressLevel = getFormattingStress(
            chunks,
            i,
            "underlined"
          );
          if (underlineStressLevel) {
            chunk.pitch += underlineStressLevel;
          }
          const boldStressLevel = getFormattingStress(chunks, i, "bolded");
          if (boldStressLevel) {
            chunk.pitch += boldStressLevel;
          }
          const italicStressLevel = getFormattingStress(
            chunks,
            i,
            "italicized"
          );
          if (italicStressLevel) {
            chunk.pitch += italicStressLevel;
          }
          const yelledStressLevel = getFormattingStress(chunks, i, "yelled");
          if (yelledStressLevel) {
            chunk.pitch += yelledStressLevel;
          }
          if (chunk.voicedSyllable) {
            inflectionIndex = Math.max(0, inflectionIndex - 1);
          }
          chunk.pitch *= stressLevelIncrement;
        }

        if (phrase.text.endsWith("\n")) {
          // Subsequent lines should either increase or decrease in pitch according to inflection slope.
          lineLevel =
            inflectionSlope > 0
              ? lineLevel + lineIncrement
              : lineLevel - lineIncrement;
        }

        // console.log(
        //   phrase.text,
        //   phrase.chunks
        //     .filter((c) => c.voicedSyllable || c.punctuated)
        //     .map((c) => c.pitch)
        // );
      }
    }
  });
};
