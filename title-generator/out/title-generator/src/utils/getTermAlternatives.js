"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTermAlternatives = void 0;
const getCleanedTerm_1 = require("./getCleanedTerm");
const getSuffixedAlternatives = (word) => {
    if (word.endsWith("_")) {
        return [];
    }
    word = word.toLowerCase();
    const general = [
        `${word}'n`,
        `${word}'s`,
        `${word}able`,
        `${word}ables`,
        `${word}ably`,
        `${word}al`,
        `${word}alist`,
        `${word}ality`,
        `${word}ally`,
        `${word}als`,
        `${word}ance`,
        `${word}ances`,
        `${word}ant`,
        `${word}ate`,
        `${word}ates`,
        `${word}ation`,
        `${word}ational`,
        `${word}ationist`,
        `${word}ationists`,
        `${word}ations`,
        `${word}boy`,
        `${word}ed`,
        `${word}eer`,
        `${word}en`,
        `${word}ens`,
        `${word}er`,
        `${word}ers`,
        `${word}ery`,
        `${word}es`,
        `${word}ess`,
        `${word}est`,
        `${word}ful`,
        `${word}fuls`,
        `${word}girl`,
        `${word}ian`,
        `${word}ic`,
        `${word}ics`,
        `${word}in'`,
        `${word}ing`,
        `${word}ings`,
        `${word}ism`,
        `${word}ist`,
        `${word}ities`,
        `${word}ity`,
        `${word}ive`,
        `${word}ives`,
        `${word}ly`,
        `${word}man`,
        `${word}mate`,
        `${word}men`,
        `${word}ment`,
        `${word}ments`,
        `${word}n`,
        `${word}ness`,
        `${word}ologist`,
        `${word}or`,
        `${word}ors`,
        `${word}ous`,
        `${word}ously`,
        `${word}person`,
        `${word}ress`,
        `${word}ry`,
        `${word}s`,
        `${word}sman`,
        `${word}swoman`,
        `${word}smen`,
        `${word}sperson`,
        `${word}ster`,
        `${word}ty`,
        `${word}ure`,
        `${word}woman`,
        `${word}ualist`,
        `${word}y`,
    ];
    const sSuffixed = word.endsWith("s")
        ? [`${word}'`, `${word}ses`, `${word.slice(0, word.length - 1)}ist`]
        : [];
    const tSuffixed = word.endsWith("t")
        ? [`${word}ion`, `${word}ionist`, `${word.slice(0, word.length - 1)}ist`]
        : [];
    const leSuffixed = word.endsWith("le")
        ? [`${word.slice(0, word.length - 2)}ility`]
        : [];
    const ateSuffixed = word.endsWith("ate")
        ? [
            `${word.slice(0, word.length - 1)}ion`,
            `${word.slice(0, word.length - 1)}ional`,
            `${word.slice(0, word.length - 1)}ionist`,
            `${word.slice(0, word.length - 1)}ions`,
            `${word.slice(0, word.length - 1)}ionship`,
        ]
        : [];
    const mSuffixed = word.endsWith("m") ? [`${word}atic`] : [`${word}matic`];
    const ySuffixed = word.endsWith("y")
        ? [
            `${word.slice(0, word.length - 1)}able`,
            `${word.slice(0, word.length - 1)}ably`,
            `${word.slice(0, word.length - 1)}ial`,
            `${word.slice(0, word.length - 1)}ian`,
            `${word.slice(0, word.length - 1)}ic`,
            `${word.slice(0, word.length - 1)}ical`,
            `${word.slice(0, word.length - 1)}ically`,
            `${word.slice(0, word.length - 1)}ied`,
            `${word.slice(0, word.length - 1)}ier`,
            `${word.slice(0, word.length - 1)}ies`,
            `${word.slice(0, word.length - 1)}iest`,
            `${word.slice(0, word.length - 1)}ing`,
            `${word.slice(0, word.length - 1)}ious`,
            `${word.slice(0, word.length - 1)}iously`,
            `${word.slice(0, word.length - 1)}ist`,
            `${word.slice(0, word.length - 1)}ity`,
            `${word.slice(0, word.length - 1)}ous`,
            `${word.slice(0, word.length - 1)}er`,
        ]
        : [
            `${word}ian`,
            `${word}ied`,
            `${word}ier`,
            `${word}ies`,
            `${word}iest`,
            `${word}ing`,
            `${word}ious`,
            `${word}iously`,
            `${word}ist`,
            `${word}ity`,
        ];
    const eSuffixed = word.endsWith("e")
        ? [
            `${word.slice(0, word.length - 1)}'n`,
            `${word.slice(0, word.length - 1)}able`,
            `${word.slice(0, word.length - 1)}al`,
            `${word.slice(0, word.length - 1)}alist`,
            `${word.slice(0, word.length - 1)}ally`,
            `${word.slice(0, word.length - 1)}als`,
            `${word.slice(0, word.length - 1)}ance`,
            `${word.slice(0, word.length - 1)}ary`,
            `${word.slice(0, word.length - 1)}ate`,
            `${word.slice(0, word.length - 1)}ation`,
            `${word.slice(0, word.length - 1)}ational`,
            `${word.slice(0, word.length - 1)}ationist`,
            `${word.slice(0, word.length - 1)}ed`,
            `${word.slice(0, word.length - 1)}er`,
            `${word.slice(0, word.length - 1)}ers`,
            `${word.slice(0, word.length - 1)}est`,
            `${word.slice(0, word.length - 1)}ian`,
            `${word.slice(0, word.length - 1)}ic`,
            `${word.slice(0, word.length - 1)}ies`,
            `${word.slice(0, word.length - 1)}ifies`,
            `${word.slice(0, word.length - 1)}ify`,
            `${word.slice(0, word.length - 1)}in'`,
            `${word.slice(0, word.length - 1)}ing`,
            `${word.slice(0, word.length - 1)}ings`,
            `${word.slice(0, word.length - 1)}ion`,
            `${word.slice(0, word.length - 1)}ionist`,
            `${word.slice(0, word.length - 1)}ist`,
            `${word.slice(0, word.length - 1)}ity`,
            `${word.slice(0, word.length - 1)}ive`,
            `${word.slice(0, word.length - 1)}n`,
            `${word.slice(0, word.length - 1)}ness`,
            `${word.slice(0, word.length - 1)}ns`,
            `${word.slice(0, word.length - 1)}or`,
            `${word.slice(0, word.length - 1)}ous`,
            `${word.slice(0, word.length - 1)}ously`,
            `${word.slice(0, word.length - 1)}tion`,
            `${word.slice(0, word.length - 1)}tional`,
            `${word.slice(0, word.length - 1)}tionist`,
        ]
        : [
            `${word + word[word.length - 1]}ed`,
            `${word + word[word.length - 1]}en`,
            `${word + word[word.length - 1]}er`,
            `${word + word[word.length - 1]}ers`,
            `${word + word[word.length - 1]}es`,
            `${word + word[word.length - 1]}est`,
            `${word + word[word.length - 1]}ian`,
            `${word + word[word.length - 1]}ies`,
            `${word + word[word.length - 1]}ing`,
            `${word + word[word.length - 1]}ings`,
            `${word + word[word.length - 1]}ist`,
            `${word + word[word.length - 1]}ly`,
            `${word + word[word.length - 1]}or`,
            `${word + word[word.length - 1]}y`,
        ];
    return [
        ...general,
        ...sSuffixed,
        ...tSuffixed,
        ...ateSuffixed,
        ...leSuffixed,
        ...mSuffixed,
        ...ySuffixed,
        ...eSuffixed,
    ];
};
const getSuffixed = (term) => {
    term = term.toLowerCase();
    if (!term.includes(" ")) {
        return getSuffixedAlternatives(term);
    }
    if (!term.includes("~")) {
        return [];
    }
    const words = term.split(" ");
    const alternativeTerms = new Set();
    words.forEach((word) => {
        if (word.endsWith("~")) {
            const cleanedWord = word.substring(0, word.length - 1);
            getSuffixedAlternatives(cleanedWord).forEach((alt) => {
                const regex = new RegExp(word, "g");
                alternativeTerms.add(term.replace(regex, alt));
            });
        }
    });
    return Array.from(alternativeTerms).flatMap((altTerm) => altTerm.endsWith("_")
        ? altTerm.substring(0, altTerm.length - 1)
        : [altTerm, ...getSuffixedAlternatives(altTerm)]);
};
const getPrefixedAlternatives = (word) => {
    if (word.startsWith("_")) {
        return [];
    }
    word = word.toLowerCase();
    const prefixed = [
        `dis${word}`,
        `dys${word}`,
        `en${word}`,
        `il${word}`,
        `im${word}`,
        `in${word}`,
        `mal${word}`,
        `mis${word}`,
        `non${word}`,
        `over${word}`,
        `re${word}`,
        `un${word}`,
    ];
    return [...prefixed];
};
const getPrefixed = (term) => {
    term = term.toLowerCase();
    if (!term.includes(" ")) {
        return getPrefixedAlternatives(term);
    }
    if (!term.includes("~")) {
        return [];
    }
    const words = term.split(" ");
    const alternativeTerms = new Set();
    words.forEach((word) => {
        if (word.startsWith("~")) {
            const cleanedWord = word.substring(1);
            getPrefixedAlternatives(cleanedWord).forEach((alt) => {
                const regex = new RegExp(word, "g");
                alternativeTerms.add(term.replace(regex, alt));
            });
        }
    });
    return Array.from(alternativeTerms).flatMap((altTerm) => altTerm.startsWith("_")
        ? altTerm.substring(1)
        : [altTerm, ...getPrefixedAlternatives(altTerm)]);
};
const getTermAlternatives = (term) => {
    const suffixedWords = getSuffixed(term);
    const prefixedWords = getPrefixed(term);
    const prefixedSuffixedWords = prefixedWords.flatMap((w) => getSuffixed(w));
    const allWords = [
        ...suffixedWords,
        ...prefixedWords,
        ...prefixedSuffixedWords,
    ];
    return Array.from(new Set(allWords))
        .map((w) => (0, getCleanedTerm_1.getCleanedTerm)(w))
        .sort();
};
exports.getTermAlternatives = getTermAlternatives;
//# sourceMappingURL=getTermAlternatives.js.map