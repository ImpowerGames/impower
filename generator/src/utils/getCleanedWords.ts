import { getCleanedTerm } from "./getCleanedTerm";

export const getCleanedWords = (phrase: string): string[] => {
  return getCleanedTerm(phrase)
    .split(" ")
    .filter((w) => Boolean(w));
};
