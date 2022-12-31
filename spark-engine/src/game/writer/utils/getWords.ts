import { Phrase } from "../types/Phrase";
import { Word } from "../types/Word";

export const getWords = (phrase: Phrase): Word[] => {
  const words: Word[] = [];

  phrase.chunks.forEach((chunk) => {
    if (words.length === 0 || chunk.startOfWord) {
      words.push({ text: "", syllables: [] });
    }
    const word = words[words.length - 1];
    if (word) {
      if (word.syllables.length === 0 || chunk.startOfSyllable) {
        word.syllables.push({ text: "", chunks: [] });
      }
      if (chunk.voiced) {
        word.text += chunk.char;
      }
      word.italicized = word.italicized || chunk.italicized;
      word.bolded = word.bolded || chunk.bolded;
      word.underlined = word.bolded || chunk.underlined;
      word.yelled = word.bolded || chunk.yelled;
      const syllable = word.syllables[word.syllables.length - 1];
      if (syllable) {
        if (chunk.voiced) {
          syllable.text += chunk.char;
        }
        syllable.chunks.push(chunk);
      }
    }
  });

  return words;
};
