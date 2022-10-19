"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRelatedTerms = exports.getReversedOccuranceMap = void 0;
const cli_progress_1 = __importDefault(require("cli-progress"));
const getTagVectors_1 = require("./getTagVectors");
const getTerms_1 = require("./getTerms");
const math_1 = require("./math");
const getReversedOccuranceMap = (map) => {
    const reversedMap = {};
    Object.entries(map).forEach(([key, value]) => {
        value.forEach(([t, s]) => {
            const tReversedMap = reversedMap[t] || [];
            reversedMap[t] = tReversedMap;
            tReversedMap.push([key, s]);
        });
    });
    const sortedReversedMap = {};
    Object.keys(reversedMap)
        .sort()
        .forEach((key) => {
        sortedReversedMap[key] = Array.from(new Set(reversedMap[key]))
            .sort(([, aSim], [, bSim]) => bSim - aSim)
            .map(([t]) => t);
    });
    return sortedReversedMap;
};
exports.getReversedOccuranceMap = getReversedOccuranceMap;
const getRelatedTerms = async (tagTerms, wordVecs, words, threshold = 0.3, depth = 5, ...tags) => {
    const termTags = {};
    const bar = new cli_progress_1.default.SingleBar({}, cli_progress_1.default.Presets.shades_classic);
    const targetTags = tags?.length > 0 ? ["<>"] : Object.keys(tagTerms);
    const targetTagTerms = tags?.length > 0 ? { "<>": tags, ...tagTerms } : tagTerms;
    bar.start(targetTags.length * 2 + words.length, 0);
    const conceptVecs = {};
    targetTags.forEach((tag, index) => {
        bar.update(index);
        // Get all existing related terms to this tag,
        // making sure to unpack any referential tags (i.e. tags that start with ">")
        conceptVecs[tag] = (0, getTagVectors_1.vectorizeTag)(tag, targetTagTerms, wordVecs);
    });
    const unpackedTagTerms = {};
    targetTags.forEach((tag, index) => {
        bar.update(targetTags.length + index);
        // Get all existing related terms to this tag in all it's possible forms
        // (past/present/future tenses, possessive, negated, etc.)
        unpackedTagTerms[tag] = (0, getTerms_1.unpackTag)(tag, targetTagTerms, true);
    });
    words.forEach((word, index) => {
        bar.update(targetTags.length * 2 + index);
        const pairs = [];
        targetTags.forEach((tag) => {
            const wordVec = wordVecs[word];
            const tagVec = wordVecs[tag] || [];
            const conceptVec = conceptVecs[tag] || [];
            if (wordVec) {
                // This vector captures the conceptual nature of a tag
                const literalSim = (0, math_1.similarity)(wordVec, conceptVec);
                // This vector captures the figurative/lingual nature of a tag
                const figurativeSim = (0, math_1.similarity)(wordVec, tagVec);
                // To maximize the potential for puns and double entendres
                // we want to include tags that are similar both literally OR figuratively
                // therefore, we use the max similarity of both.
                pairs.push([tag, Math.max(literalSim, figurativeSim)]);
            }
        });
        if (!termTags[word]) {
            termTags[word] = [];
        }
        const relatedTags = [];
        pairs
            .sort(([, aSim], [, bSim]) => bSim - aSim)
            .forEach(([tag, sim]) => {
            const existingTerms = unpackedTagTerms[tag] || [];
            if (relatedTags.length < depth &&
                sim > threshold &&
                !existingTerms.includes(word)) {
                relatedTags.push([tag, sim]);
            }
        });
        if (relatedTags.length > 0) {
            termTags[word] = relatedTags;
        }
    });
    bar.stop();
    const getReferencesCount = (tag) => targetTagTerms[tag]?.filter((term) => term.startsWith(">")).length || 0;
    const suggestedTagTerms = (0, exports.getReversedOccuranceMap)(termTags);
    const sortedSuggestedTagTerms = {};
    Object.entries(suggestedTagTerms)
        .sort(([tagA], [tagB]) => getReferencesCount(tagA) - getReferencesCount(tagB))
        .forEach(([tag, suggestedTerms]) => {
        sortedSuggestedTagTerms[tag] = suggestedTerms;
    });
    return sortedSuggestedTagTerms;
};
exports.getRelatedTerms = getRelatedTerms;
//# sourceMappingURL=getRelatedTerms.js.map