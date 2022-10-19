"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCleanedTagTerms = void 0;
const getTerms_1 = require("./getTerms");
const getCleanedTagTerms = (tagTerms, order = "alphabetical") => {
    const organizedTerms = {};
    Object.entries(tagTerms).forEach(([tag, terms]) => {
        organizedTerms[tag] = Array.from(new Set(terms.sort()));
    });
    const cleanedTerms = {};
    Object.entries(organizedTerms).forEach(([tag, terms]) => {
        const { specific, adjacent } = (0, getTerms_1.unpackSpecificAndAdjacentTerms)(tag, tagTerms);
        const transformedSpecific = (0, getTerms_1.transformTerms)(specific);
        const transformedAdjacent = (0, getTerms_1.transformTerms)(adjacent);
        cleanedTerms[tag] = terms
            .filter((term) => !transformedAdjacent.includes(term) &&
            transformedSpecific.filter((t) => t === term).length < 2)
            .map((term) => !term.startsWith(">") && term.includes(" ") && !term.includes("_")
            ? `_${term}_`
            : term)
            .sort();
    });
    const sortedTerms = {};
    Object.entries(cleanedTerms)
        .sort(([aKey, aValue], [bKey, bValue]) => {
        if (order === "term-count") {
            return aValue.length - bValue.length;
        }
        return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
    })
        .forEach(([tag, terms]) => {
        sortedTerms[tag] = terms;
    });
    return sortedTerms;
};
exports.getCleanedTagTerms = getCleanedTagTerms;
//# sourceMappingURL=getCleanedTagTerms.js.map