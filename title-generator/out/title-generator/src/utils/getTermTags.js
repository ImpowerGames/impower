"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTermTags = exports.intensityModifiers = exports.positiveModifiers = exports.negativeModifiers = void 0;
const getKeyphrases_1 = require("./getKeyphrases");
const getSortedMap_1 = require("./getSortedMap");
const getTerms_1 = require("./getTerms");
exports.negativeModifiers = [
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
exports.positiveModifiers = [
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
exports.intensityModifiers = ["really", "very", "too", "extremely", "so"];
const getPositive = (term) => {
    const modded = new Set();
    exports.positiveModifiers.forEach((pos) => {
        modded.add(term.replace(/\*pos/g, pos));
        exports.intensityModifiers.forEach((int) => {
            modded.add(term.replace(/\*pos/g, `${pos} ${int}`));
        });
    });
    return Array.from(modded);
};
const getNegative = (term) => {
    const modded = new Set();
    exports.negativeModifiers.forEach((neg) => {
        modded.add(term.replace(/\*neg/g, neg));
        exports.intensityModifiers.forEach((int) => {
            modded.add(term.replace(/\*neg/g, `${neg} ${int}`));
        });
    });
    return Array.from(modded);
};
const getTermTags = (tagTerms, phrases) => {
    const validKeyphrases = (0, getKeyphrases_1.getKeyphrases)(phrases);
    const termTags = {};
    const tags = Object.keys(tagTerms) || [];
    tags.forEach((tag) => {
        const terms = (0, getTerms_1.unpackTag)(tag, tagTerms, true);
        terms.forEach((term) => {
            if (term) {
                const subphrases = new Set();
                if (term.includes("*")) {
                    const allConnotations = getNegative(term).flatMap((alt) => getPositive(alt));
                    allConnotations.forEach((connotatedTerm) => {
                        subphrases.add(connotatedTerm);
                    });
                }
                else {
                    subphrases.add(term);
                }
                subphrases.forEach((subphrase) => {
                    if (validKeyphrases[subphrase]) {
                        if (!termTags[subphrase] || !Array.isArray(termTags[subphrase])) {
                            termTags[subphrase] = [];
                        }
                        if (!termTags[subphrase]?.includes(tag)) {
                            termTags[subphrase]?.push(tag);
                        }
                    }
                });
            }
        });
    });
    return (0, getSortedMap_1.getSortedMap)(termTags, true);
};
exports.getTermTags = getTermTags;
//# sourceMappingURL=getTermTags.js.map