"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getKeywords = void 0;
const getCleanedWords_1 = require("./getCleanedWords");
const getKeywords = (phrases, sort = false) => {
    const keywords = {};
    phrases.forEach((phrase) => {
        const words = (0, getCleanedWords_1.getCleanedWords)(phrase);
        words.forEach((word) => {
            keywords[word] = (keywords[word] || 0) + 1;
        });
    });
    if (sort) {
        const sortedEntries = Object.entries(keywords).sort(([, aValue], [, bValue]) => {
            return bValue - aValue;
        });
        const sortedDict = {};
        sortedEntries.forEach(([key, value]) => {
            sortedDict[key] = value;
        });
        return sortedDict;
    }
    return keywords;
};
exports.getKeywords = getKeywords;
//# sourceMappingURL=getKeywords.js.map