"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClosestTags = void 0;
const getTagVectors_1 = require("./getTagVectors");
const math_1 = require("./math");
const getClosestTags = (tagTerms, termVecs, depth = 5, ...words) => {
    const targetConcept = (0, math_1.average)(words.map((w) => termVecs[w] || []));
    const tagConceptPairs = Object.keys(tagTerms).map((tag) => [
        tag,
        (0, math_1.similarity)(targetConcept, (0, getTagVectors_1.vectorizeTag)(tag, tagTerms, termVecs)),
    ]);
    return tagConceptPairs
        .sort(([, aSim], [, bSim]) => bSim - aSim)
        .slice(0, depth)
        .map(([w]) => w);
};
exports.getClosestTags = getClosestTags;
//# sourceMappingURL=getClosestTags.js.map