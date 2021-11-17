import { getKeyphrases } from "./getKeyphrases";
import { getSortedMap } from "./getSortedMap";
import { unpackTag } from "./getTerms";

export const negativeModifiers = [
  "don't",
  "couldn't",
  "wouldn't",
  "shouldn't",
  "won't",
  "can't",
  "cannot",
  "not",
  "no longer",
];
export const positiveModifiers = [
  "do",
  "would",
  "could",
  "will",
  "can",
  "i",
  "he",
  "she",
  "they",
  "we",
  "i'll",
  "he'll",
  "she'll",
  "they'll",
  "we'll",
  "i'd",
  "he'd",
  "she'd",
  "they'd",
  "we'd",
];
export const intensityModifiers = ["really", "very", "too", "extremely", "so"];

const getPositive = (term: string): string[] => {
  const modded = new Set<string>();
  positiveModifiers.forEach((pos) => {
    modded.add(term.replace(/\*pos/g, pos));
    intensityModifiers.forEach((int) => {
      modded.add(term.replace(/\*pos/g, `${pos} ${int}`));
    });
  });
  return Array.from(modded);
};

const getNegative = (term: string): string[] => {
  const modded = new Set<string>();
  negativeModifiers.forEach((neg) => {
    modded.add(term.replace(/\*neg/g, neg));
    intensityModifiers.forEach((int) => {
      modded.add(term.replace(/\*neg/g, `${neg} ${int}`));
    });
  });
  return Array.from(modded);
};

export const getTermTags = (
  tagTerms: {
    [tag: string]: string[];
  },
  phrases: string[]
): { [word: string]: string[] } => {
  const validKeyphrases = getKeyphrases(phrases);
  const termTags: { [word: string]: string[] } = {};
  const tags = Object.keys(tagTerms) || [];
  tags.forEach((tag) => {
    const terms = unpackTag(tag, tagTerms, true);
    terms.forEach((term) => {
      if (term) {
        const subphrases = new Set<string>();
        if (term.includes("*")) {
          const allConnotations = getNegative(term).flatMap((alt) =>
            getPositive(alt)
          );
          allConnotations.forEach((connotatedTerm) => {
            subphrases.add(connotatedTerm);
          });
        } else {
          subphrases.add(term);
        }
        subphrases.forEach((subphrase) => {
          if (validKeyphrases[subphrase]) {
            if (!termTags[subphrase] || !Array.isArray(termTags[subphrase])) {
              termTags[subphrase] = [];
            }
            if (!termTags[subphrase]?.includes(tag)) {
              termTags[subphrase].push(tag);
            }
          }
        });
      }
    });
  });
  return getSortedMap(termTags, true);
};
