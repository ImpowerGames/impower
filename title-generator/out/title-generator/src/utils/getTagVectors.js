"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTagVectors = exports.vectorizeTag = exports.vectorizeTerms = void 0;
const getTerms_1 = require("./getTerms");
const math_1 = require("./math");
const vectorizeTerms = (terms, tagTerms, termVectors) => {
    const { specificTerms, adjacentTerms } = (0, getTerms_1.splitSpecificAndAdjacentTerms)(terms);
    const specificVecs = specificTerms.map((term) => termVectors[term] || []);
    const adjacentVecs = [];
    adjacentTerms.forEach((adjacentTerm) => {
        adjacentVecs.push((0, exports.vectorizeTerms)(tagTerms[adjacentTerm.replace(">", "")] || [], tagTerms, termVectors));
    });
    const specificAvgVec = (0, math_1.average)(specificVecs);
    return (0, math_1.average)([specificAvgVec, ...adjacentVecs]);
};
exports.vectorizeTerms = vectorizeTerms;
const vectorizeTag = (tag, tagTerms, termVectors) => {
    const relatedTerms = tagTerms[tag];
    if (relatedTerms) {
        return (0, exports.vectorizeTerms)(relatedTerms, tagTerms, termVectors);
    }
    return (0, exports.vectorizeTerms)([tag], tagTerms, termVectors);
};
exports.vectorizeTag = vectorizeTag;
const getTagVectors = (tagTerms, termVectors) => {
    const tagVectors = {};
    Object.keys(tagTerms).forEach((tag) => {
        tagVectors[tag] = (0, exports.vectorizeTag)(tag, tagTerms, termVectors);
    });
    return tagVectors;
};
exports.getTagVectors = getTagVectors;
//# sourceMappingURL=getTagVectors.js.map