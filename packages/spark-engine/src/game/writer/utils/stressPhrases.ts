import { Character } from "../types/Character";
import { Chunk } from "../types/Chunk";
import { Phrase } from "../types/Phrase";
import { Writer } from "../types/Writer";
import { getStressType } from "./getStressType";
import { getWords } from "./getWords";
import { stressWord } from "./stressWord";

export const stressPhrases = (
  phrases: Phrase[],
  character: Character | undefined,
  writer: Writer | undefined
): void => {
  const letterDelay = writer?.letterDelay ?? 0;
  const maxSyllableLength = character?.prosody?.maxSyllableLength || 0;
  const weakWords = character?.prosody?.weakWords || [];
  const contractions = character?.prosody?.contractions || [];
  const weakWordVariants = weakWords.flatMap((w) => [
    w,
    ...contractions.map((c) => `${w}${c}`),
  ]);

  phrases.forEach((phrase) => {
    const finalStressType = getStressType(phrase.text, character?.prosody);
    const inflection = character?.intonation[finalStressType || "statement"];
    const downdriftIncrement = character?.intonation?.downdriftIncrement || 0;
    const syllableFluctuation = character?.intonation?.syllableFluctuation || 0;
    const dilation = inflection?.finalDilation;
    const neutralLevel = inflection?.neutralLevel;
    const finalContour = inflection?.finalContour || [];
    const emphasisContour = inflection?.emphasisContour || finalContour;

    const words = getWords(phrase);

    let currentNeutralLevel = neutralLevel || 0;
    let stressedWordFound = false;
    let terminalWordExists = false;
    let fluctuationDirection = -1;
    for (let i = words.length - 1; i >= 0; i -= 1) {
      const word = words[i];
      if (word && word.text) {
        // Enforce a minimum duration for all syllables
        const minSyllableLength = maxSyllableLength - 1;
        const minSyllableDuration = minSyllableLength * letterDelay;
        word.syllables.forEach((s) => {
          if (s.text.length < minSyllableLength) {
            let syllableDuration = 0;
            let lastVoicedChunk: Chunk | undefined = undefined;
            s.chunks.forEach((c) => {
              syllableDuration += c.duration;
              if (c.voiced) {
                lastVoicedChunk = c;
              }
            });
            if (lastVoicedChunk) {
              // Pad the end of the syllable to ensure the syllable duration is long enough
              // (this can help prevent audio clicks for very short words)
              if (syllableDuration < minSyllableDuration) {
                (lastVoicedChunk as Chunk).duration +=
                  minSyllableDuration - syllableDuration;
              }
            }
          }
        });
        if (word.italicized || word.bolded || word.underlined || word.yelled) {
          stressedWordFound = true;
          // Stress words with forced emphasis
          stressWord(word, emphasisContour);
        } else if (!stressedWordFound) {
          const cleanedText = word.text.toLowerCase().trim();
          const isPossibleFocusWord = !weakWordVariants.includes(cleanedText);
          if (isPossibleFocusWord) {
            stressedWordFound = true;
            // If this word is followed by a terminal word,
            // there is no need to include the terminal stress index when stressing this word
            const stressContour = terminalWordExists
              ? finalContour.slice(0, -1)
              : finalContour;
            stressWord(word, stressContour);
          } else {
            terminalWordExists = true;
            // All words after the focus word are terminal words
            word.syllables.forEach((s) => {
              s.chunks.forEach((c) => {
                const terminalStressIndex = finalContour.length - 1;
                c.stressLevel = finalContour[terminalStressIndex];
              });
            });
          }
        }
        word.syllables.forEach((s) => {
          s.chunks.forEach((c) => {
            if (c.stressLevel === undefined) {
              c.stressLevel =
                currentNeutralLevel +
                fluctuationDirection * syllableFluctuation;
              currentNeutralLevel += downdriftIncrement;
            }
          });
          fluctuationDirection *= -1;
        });
      }
    }

    for (let i = 0; i < words.length; i += 1) {
      const word = words[i];
      if (word) {
        word.syllables.forEach((s) => {
          s.chunks.forEach((c) => {
            c.stressLevel = (c.stressLevel || 0) - currentNeutralLevel;
          });
        });
      }
    }

    let scaledFinalWord = false;
    for (let i = words.length - 1; i >= 0; i -= 1) {
      if (stressedWordFound && scaledFinalWord) {
        // Nothing left to do
        break;
      }
      const word = words[i];
      if (word) {
        if (word.text) {
          if (!stressedWordFound) {
            stressedWordFound = true;
            // Just stress the last word of the phrase
            stressWord(word, finalContour);
          }
        }
        if (!scaledFinalWord) {
          scaledFinalWord = true;
          // Apply dilation to last word
          word.syllables.forEach((s) => {
            s.chunks.forEach((c) => {
              c.duration *= dilation || 1;
            });
          });
        }
      }
    }

    phrase.finalStressType = finalStressType;
  });
};
