"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getKeyphrases = void 0;
const getCleanedWords_1 = require("./getCleanedWords");
const getKeyphrases = (phrases, sort = false) => {
    const subphrases = {};
    phrases.forEach((phrase) => {
        const words = (0, getCleanedWords_1.getCleanedWords)(phrase);
        for (let i = 0; i <= words.length; i += 1) {
            for (let j = 1; j <= words.length; j += 1) {
                const subphrase = words.slice(i, j).join(" ");
                if (subphrase) {
                    subphrases[subphrase] = (subphrases[subphrase] || 0) + 1;
                }
            }
        }
    });
    if (sort) {
        const sortedEntries = Object.entries(subphrases).sort(([, aValue], [, bValue]) => {
            return bValue - aValue;
        });
        const sortedDict = {};
        sortedEntries.forEach(([key, value]) => {
            sortedDict[key] = value;
        });
        return sortedDict;
    }
    return subphrases;
};
exports.getKeyphrases = getKeyphrases;
//# sourceMappingURL=getKeyphrases.js.map