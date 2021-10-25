import cliProgress from "cli-progress";
import { distance } from "fastest-levenshtein";
import { getCleanedWords } from "./getCleanedWords";

const findLongestCommonSubstring = (str1 = "", str2 = ""): string => {
  const s1 = [...str1];
  const s2 = [...str2];
  const arr = Array(s2.length + 1)
    .fill(null)
    .map(() => {
      return Array(s1.length + 1).fill(null);
    });
  for (let j = 0; j <= s1.length; j += 1) {
    arr[0][j] = 0;
  }
  for (let i = 0; i <= s2.length; i += 1) {
    arr[i][0] = 0;
  }
  let len = 0;
  let col = 0;
  let row = 0;
  for (let i = 1; i <= s2.length; i += 1) {
    for (let j = 1; j <= s1.length; j += 1) {
      if (s1[j - 1] === s2[i - 1]) {
        arr[i][j] = arr[i - 1][j - 1] + 1;
      } else {
        arr[i][j] = 0;
      }
      if (arr[i][j] > len) {
        len = arr[i][j];
        col = j;
        row = i;
      }
    }
  }
  if (len === 0) {
    return "";
  }
  let res = "";
  while (arr[row][col] > 0) {
    res = s1[col - 1] + res;
    row -= 1;
    col -= 1;
  }
  return res;
};

export const getSimilarPhrases = (
  phrases: string[],
  keywords: { [word: string]: number }
): { [phrase: string]: [string, number][] } => {
  const similarPhrases: {
    [phrase: string]: [string, number][];
  } = {};
  const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
  bar.start(phrases.length);
  phrases.forEach((aPhrase, index) => {
    bar.update(index);
    const pairs: [string, number][] = [];
    phrases.forEach((bPhrase) => {
      if (aPhrase !== bPhrase) {
        const aWords = getCleanedWords(aPhrase);
        const bWords = getCleanedWords(bPhrase);
        const longestCommonSubstring = findLongestCommonSubstring(
          aPhrase,
          bPhrase
        ).toLowerCase();
        if (longestCommonSubstring.length >= 3) {
          let sameWordCount = 0;
          let similarWordCount = 0;
          aWords.forEach((aW) => {
            bWords.forEach((bW) => {
              if (keywords[aW] || keywords[bW]) {
                if (aW === bW) {
                  sameWordCount += 1;
                }
                if (distance(aW, bW) <= 3) {
                  similarWordCount += 1;
                }
              }
            });
          });
          if (sameWordCount >= 1 && similarWordCount >= 2) {
            pairs.push([bPhrase, distance(aPhrase, bPhrase)]);
          }
        }
      }
    });
    if (pairs.length > 0) {
      similarPhrases[aPhrase] = pairs.sort((a, b) => a[1] - b[1]).slice(0, 3);
    }
  });
  const sortedSimilarPhrases: { [phrase: string]: [string, number][] } = {};
  Object.entries(similarPhrases)
    .sort(([, aV], [, bV]) => aV[0][1] - bV[0][1])
    .forEach(([key, value]) => {
      sortedSimilarPhrases[key] = value;
    });
  bar.stop();
  return sortedSimilarPhrases;
};
