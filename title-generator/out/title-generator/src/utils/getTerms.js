"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.unpackSpecificAndAdjacentTerms = exports.unpackTag = exports.unpackTerms = exports.splitSpecificAndAdjacentTerms = exports.transformTerms = void 0;
const getCleanedTerm_1 = require("./getCleanedTerm");
const getTermAlternatives_1 = require("./getTermAlternatives");
const transformTerms = (terms) => [
    ...terms.map((term) => (0, getCleanedTerm_1.getCleanedTerm)(term)),
    ...terms.flatMap((term) => (0, getTermAlternatives_1.getTermAlternatives)(term)),
].sort();
exports.transformTerms = transformTerms;
const splitSpecificAndAdjacentTerms = (terms) => {
    if (!terms) {
        return { specificTerms: [], adjacentTerms: [] };
    }
    const [specificTerms, adjacentTerms] = terms.reduce((result, tag) => {
        result[tag.startsWith(">") ? 1 : 0].push(tag);
        return result;
    }, [[], []]);
    return { specificTerms, adjacentTerms };
};
exports.splitSpecificAndAdjacentTerms = splitSpecificAndAdjacentTerms;
const unpackTerms = (terms, tagTerms) => {
    let { specificTerms, adjacentTerms } = (0, exports.splitSpecificAndAdjacentTerms)(terms);
    while (adjacentTerms.length > 0) {
        specificTerms.push(...adjacentTerms.flatMap((lookup) => tagTerms[lookup.replace(">", "")] || []));
        const result = (0, exports.splitSpecificAndAdjacentTerms)(specificTerms);
        specificTerms = result.specificTerms;
        adjacentTerms = result.adjacentTerms;
    }
    const allTerms = specificTerms.sort();
    const uniqueTerms = Array.from(new Set(allTerms)).filter((term) => Boolean(term));
    return uniqueTerms;
};
exports.unpackTerms = unpackTerms;
const unpackTag = (tag, tagTerms, allForms = false) => {
    const terms = (0, exports.unpackTerms)(tagTerms[tag] || [], tagTerms);
    if (!allForms) {
        return terms;
    }
    return (0, exports.transformTerms)(terms);
};
exports.unpackTag = unpackTag;
const unpackSpecificAndAdjacentTerms = (tag, tagTerms, allForms = false) => {
    const { specificTerms, adjacentTerms } = (0, exports.splitSpecificAndAdjacentTerms)(tagTerms[tag] || []);
    if (!tagTerms[tag]) {
        console.warn("No terms exist in tagTerms.json for: ", tag);
    }
    const allSpecificTerms = (0, exports.unpackTerms)(specificTerms, tagTerms);
    const allAdjacentTerms = (0, exports.unpackTerms)(adjacentTerms, tagTerms);
    if (!allForms) {
        return { specific: allSpecificTerms, adjacent: allAdjacentTerms };
    }
    return {
        specific: (0, exports.transformTerms)(allSpecificTerms),
        adjacent: (0, exports.transformTerms)(allAdjacentTerms),
    };
};
exports.unpackSpecificAndAdjacentTerms = unpackSpecificAndAdjacentTerms;
//# sourceMappingURL=getTerms.js.map