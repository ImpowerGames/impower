"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCuratedPhrases = void 0;
const getCleanedWords_1 = require("./getCleanedWords");
const getSortedMap_1 = require("./getSortedMap");
const getCuratedPhrases = (phrases, termTags, consoleOutputPhrase = "") => {
    const associatedTags = {};
    const validConsoleOutputPhrase = consoleOutputPhrase ||
        phrases[Math.floor(Math.random() * (phrases.length - 1))];
    console.log(`"${validConsoleOutputPhrase}"`);
    phrases.forEach((phrase) => {
        const words = (0, getCleanedWords_1.getCleanedWords)(phrase);
        const subphrases = new Set();
        for (let i = 0; i <= words.length; i += 1) {
            for (let j = 1; j <= words.length; j += 1) {
                const subphrase = words.slice(i, j).join(" ");
                if (subphrase) {
                    subphrases.add(subphrase);
                }
            }
        }
        const phraseTags = [];
        subphrases.forEach((subphrase) => {
            const tagMatches = termTags[subphrase] || [];
            if (phrase === validConsoleOutputPhrase && tagMatches.length > 0) {
                console.log(subphrase, tagMatches);
            }
            phraseTags.push(...tagMatches);
        });
        const phraseAssociatedTags = associatedTags[phrase] || [];
        associatedTags[phrase] = phraseAssociatedTags;
        phraseAssociatedTags.push(...phraseTags);
    });
    return (0, getSortedMap_1.getSortedMap)(associatedTags, true);
};
exports.getCuratedPhrases = getCuratedPhrases;
//# sourceMappingURL=getCuratedPhrases.js.map