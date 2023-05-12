import { distance } from "fastest-levenshtein";
import { getCleanedWords } from "../../src/utils/getCleanedWords";

const findLongestCommonSubstring = (str1 = "", str2 = ""): string => {
  const s1 = [...str1];
  const s2 = [...str2];
  const arr = Array(s2.length + 1)
    .fill(null)
    .map(() => {
      return Array(s1.length + 1).fill(null);
    });
  for (let j = 0; j <= s1.length; j += 1) {
    const a = arr[0];
    if (a) {
      a[j] = 0;
    }
  }
  for (let i = 0; i <= s2.length; i += 1) {
    const a = arr[i];
    if (a) {
      a[0] = 0;
    }
  }
  let len = 0;
  let col = 0;
  let row = 0;
  for (let i = 1; i <= s2.length; i += 1) {
    for (let j = 1; j <= s1.length; j += 1) {
      const a = arr[i];
      if (a) {
        if (s1[j - 1] === s2[i - 1]) {
          a[j] = arr[i - 1]?.[j - 1] + 1;
        } else {
          a[j] = 0;
        }
        if (a[j] > len) {
          len = a[j];
          col = j;
          row = i;
        }
      }
    }
  }
  if (len === 0) {
    return "";
  }
  let res = "";
  const a = arr[row];
  while (a && a[col] > 0) {
    res = s1[col - 1] + res;
    row -= 1;
    col -= 1;
  }
  return res;
};

export const getSimilarPhrases = (
  phrases: string[],
  keywords: { [word: string]: number },
  onProgress?: (current: number, total: number) => void
): { [phrase: string]: [string, number][] } => {
  const similarPhrases: {
    [phrase: string]: [string, number][];
  } = {};
  onProgress?.(-1, phrases.length);
  phrases.forEach((aPhrase, index) => {
    onProgress?.(index, phrases.length);
    const pairs: [string, number][] = [];
    phrases.forEach((bPhrase) => {
      if (aPhrase !== bPhrase) {
        const aWords = getCleanedWords(aPhrase);
        const bWords = getCleanedWords(bPhrase);
        const longestCommonSubstring = findLongestCommonSubstring(
          aPhrase,
          bPhrase
        ).toLowerCase();
        const longerPhraseWords =
          aWords.length > bWords.length ? aWords : bWords;
        if (longerPhraseWords.length >= 3) {
          if (longestCommonSubstring.length >= 3) {
            let sameWords: string[] = [];
            let similarWordCount = 0;
            aWords.forEach((aW) => {
              bWords.forEach((bW) => {
                if (keywords[aW] || keywords[bW]) {
                  if (aW === bW) {
                    if (!sameWords.includes(aW)) {
                      sameWords.push(aW);
                    }
                  }
                  if (distance(aW, bW) <= 3) {
                    similarWordCount += 1;
                  }
                }
              });
            });
            if (sameWords.length >= 2 && similarWordCount >= 2) {
              pairs.push([bPhrase, distance(aPhrase, bPhrase)]);
            }
          }
        }
      }
    });
    if (pairs.length > 0) {
      const similar = pairs.sort((a, b) => a[1] - b[1]).slice(0, 3);
      const first = similar[0];
      if (first !== undefined) {
        if (first[1] <= 8) {
          similarPhrases[aPhrase] = similar;
        }
      }
    }
  });
  const sortedSimilarPhrases: { [phrase: string]: [string, number][] } = {};
  Object.entries(similarPhrases)
    .sort(([, aV], [, bV]) => (aV[0]?.[1] || 0) - (bV[0]?.[1] || 0))
    .forEach(([key, value]) => {
      sortedSimilarPhrases[key] = value;
    });
  onProgress?.(phrases.length, phrases.length);
  return sortedSimilarPhrases;
};
