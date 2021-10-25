import { getCleanedTerm } from "./getCleanedTerm";

const getSuffixedAlternatives = (word: string): string[] => {
  if (word.endsWith("_")) {
    return [];
  }
  word = word.toLowerCase();
  const general = [
    `${word}'s`,
    `${word}able`,
    `${word}ables`,
    `${word}ably`,
    `${word}ty`,
    `${word}al`,
    `${word}ally`,
    `${word}ality`,
    `${word}als`,
    `${word}ance`,
    `${word}ances`,
    `${word}ate`,
    `${word}ates`,
    `${word}ation`,
    `${word}ations`,
    `${word}ationist`,
    `${word}ationists`,
    `${word}ed`,
    `${word}en`,
    `${word}ens`,
    `${word}er`,
    `${word}ery`,
    `${word}ers`,
    `${word}es`,
    `${word}est`,
    `${word}ful`,
    `${word}fuls`,
    `${word}ic`,
    `${word}ics`,
    `${word}in'`,
    `${word}ing`,
    `${word}ings`,
    `${word}ism`,
    `${word}ity`,
    `${word}ities`,
    `${word}ly`,
    `${word}'n`,
    `${word}ment`,
    `${word}ments`,
    `${word}n`,
    `${word}ness`,
    `${word}or`,
    `${word}ors`,
    `${word}ous`,
    `${word}ously`,
    `${word}ress`,
    `${word}ry`,
    `${word}s`,
    `${word}y`,
    `${word}ive`,
    `${word}ives`,
  ];
  const sSuffixed = word.endsWith("s") ? [`${word}'`, `${word}ses`] : [];
  const tSuffixed = word.endsWith("t") ? [`${word}ion`, `${word}ionist`] : [];
  const leSuffixed = word.endsWith("le")
    ? [`${word.slice(0, word.length - 2)}ility`]
    : [];
  const mSuffixed = word.endsWith("m") ? [`${word}atic`] : [`${word}matic`];
  const ySuffixed = word.endsWith("y")
    ? [
        `${word.slice(0, word.length - 1)}able`,
        `${word.slice(0, word.length - 1)}ably`,
        `${word.slice(0, word.length - 1)}ied`,
        `${word.slice(0, word.length - 1)}ier`,
        `${word.slice(0, word.length - 1)}ies`,
        `${word.slice(0, word.length - 1)}iest`,
        `${word.slice(0, word.length - 1)}ing`,
        `${word.slice(0, word.length - 1)}ious`,
        `${word.slice(0, word.length - 1)}iously`,
        `${word.slice(0, word.length - 1)}ity`,
        `${word.slice(0, word.length - 1)}ic`,
        `${word.slice(0, word.length - 1)}ial`,
        `${word.slice(0, word.length - 1)}ical`,
        `${word.slice(0, word.length - 1)}ically`,
      ]
    : [
        `${word}ation`,
        `${word}ied`,
        `${word}ier`,
        `${word}ies`,
        `${word}iest`,
        `${word}ing`,
        `${word}ious`,
        `${word}iously`,
        `${word}ity`,
      ];
  const eSuffixed = word.endsWith("e")
    ? [
        `${word.slice(0, word.length - 1)}'n`,
        `${word.slice(0, word.length - 1)}able`,
        `${word.slice(0, word.length - 1)}al`,
        `${word.slice(0, word.length - 1)}ally`,
        `${word.slice(0, word.length - 1)}als`,
        `${word.slice(0, word.length - 1)}ance`,
        `${word.slice(0, word.length - 1)}ary`,
        `${word.slice(0, word.length - 1)}ate`,
        `${word.slice(0, word.length - 1)}ation`,
        `${word.slice(0, word.length - 1)}ationist`,
        `${word.slice(0, word.length - 1)}ed`,
        `${word.slice(0, word.length - 1)}er`,
        `${word.slice(0, word.length - 1)}ers`,
        `${word.slice(0, word.length - 1)}est`,
        `${word.slice(0, word.length - 1)}ic`,
        `${word.slice(0, word.length - 1)}ies`,
        `${word.slice(0, word.length - 1)}in'`,
        `${word.slice(0, word.length - 1)}ing`,
        `${word.slice(0, word.length - 1)}ings`,
        `${word.slice(0, word.length - 1)}ion`,
        `${word.slice(0, word.length - 1)}ionist`,
        `${word.slice(0, word.length - 1)}ity`,
        `${word.slice(0, word.length - 1)}ive`,
        `${word.slice(0, word.length - 1)}n`,
        `${word.slice(0, word.length - 1)}ness`,
        `${word.slice(0, word.length - 1)}ns`,
        `${word.slice(0, word.length - 1)}or`,
        `${word.slice(0, word.length - 1)}ous`,
        `${word.slice(0, word.length - 1)}ously`,
        `${word.slice(0, word.length - 1)}tion`,
        `${word.slice(0, word.length - 1)}tionist`,
        `${word.slice(0, word.length - 1)}ist`,
        `${word.slice(0, word.length - 1)}ify`,
        `${word.slice(0, word.length - 1)}ifies`,
      ]
    : [
        `${word + word[word.length - 1]}ed`,
        `${word + word[word.length - 1]}en`,
        `${word + word[word.length - 1]}er`,
        `${word + word[word.length - 1]}ers`,
        `${word + word[word.length - 1]}es`,
        `${word + word[word.length - 1]}est`,
        `${word + word[word.length - 1]}ies`,
        `${word + word[word.length - 1]}ing`,
        `${word + word[word.length - 1]}ings`,
        `${word + word[word.length - 1]}ly`,
        `${word + word[word.length - 1]}or`,
        `${word + word[word.length - 1]}y`,
      ];
  return [
    ...general,
    ...sSuffixed,
    ...tSuffixed,
    ...leSuffixed,
    ...mSuffixed,
    ...ySuffixed,
    ...eSuffixed,
  ];
};

const getSuffixed = (term: string): string[] => {
  term = term.toLowerCase();
  if (!term.includes(" ")) {
    return getSuffixedAlternatives(term);
  }
  if (!term.includes("~")) {
    return [];
  }
  const words = term.split(" ");
  const alternativeTerms = new Set<string>();
  words.forEach((word) => {
    if (word.endsWith("~")) {
      const cleanedWord = word.substring(0, word.length - 1);
      getSuffixedAlternatives(cleanedWord).forEach((alt) => {
        const regex = new RegExp(word, "g");
        alternativeTerms.add(term.replace(regex, alt));
      });
    }
  });
  return Array.from(alternativeTerms).flatMap((altTerm) =>
    altTerm.endsWith("_")
      ? altTerm.substring(0, altTerm.length - 1)
      : [altTerm, ...getSuffixedAlternatives(altTerm)]
  );
};

const getPrefixedAlternatives = (word: string): string[] => {
  if (word.startsWith("_")) {
    return [];
  }
  word = word.toLowerCase();
  const prefixed = [
    `over${word}`,
    `en${word}`,
    `re${word}`,
    `dis${word}`,
    `dys${word}`,
    `il${word}`,
    `im${word}`,
    `in${word}`,
    `mal${word}`,
    `mis${word}`,
    `non${word}`,
    `un${word}`,
  ];
  return [...prefixed];
};

const getPrefixed = (term: string): string[] => {
  term = term.toLowerCase();
  if (!term.includes(" ")) {
    return getPrefixedAlternatives(term);
  }
  if (!term.includes("~")) {
    return [];
  }
  const words = term.split(" ");
  const alternativeTerms = new Set<string>();
  words.forEach((word) => {
    if (word.startsWith("~")) {
      const cleanedWord = word.substring(1);
      getPrefixedAlternatives(cleanedWord).forEach((alt) => {
        const regex = new RegExp(word, "g");
        alternativeTerms.add(term.replace(regex, alt));
      });
    }
  });
  return Array.from(alternativeTerms).flatMap((altTerm) =>
    altTerm.startsWith("_")
      ? altTerm.substring(1)
      : [altTerm, ...getPrefixedAlternatives(altTerm)]
  );
};

export const getTermAlternatives = (term: string): string[] => {
  const suffixedWords = getSuffixed(term);
  const prefixedWords = getPrefixed(term);
  const prefixedSuffixedWords = prefixedWords.flatMap((w) => getSuffixed(w));
  const allWords = [
    ...suffixedWords,
    ...prefixedWords,
    ...prefixedSuffixedWords,
  ];
  return Array.from(new Set(allWords))
    .map((w) => getCleanedTerm(w))
    .sort();
};
