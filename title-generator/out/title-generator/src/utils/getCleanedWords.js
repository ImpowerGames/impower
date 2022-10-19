"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCleanedWords = void 0;
const getCleanedTerm_1 = require("./getCleanedTerm");
const getCleanedWords = (phrase) => {
    return (0, getCleanedTerm_1.getCleanedTerm)(phrase)
        .split(" ")
        .filter((w) => Boolean(w));
};
exports.getCleanedWords = getCleanedWords;
//# sourceMappingURL=getCleanedWords.js.map