"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConceptualDifference = void 0;
const cli_progress_1 = __importDefault(require("cli-progress"));
const math_1 = require("./math");
const getConceptualDifference = (targetWord, otherWord, wordVecs, depth = 30) => {
    const bar = new cli_progress_1.default.SingleBar({}, cli_progress_1.default.Presets.shades_classic);
    const words = Object.keys(wordVecs);
    bar.start(words.length, 0);
    const targetConcept = wordVecs[targetWord];
    const otherConcept = wordVecs[otherWord];
    if (!targetConcept) {
        throw new Error(`Vector does not exist for: ${targetWord}`);
    }
    if (!otherConcept) {
        throw new Error(`Vector does not exist for: ${otherConcept}`);
    }
    const diff = (0, math_1.difference)(targetConcept, otherConcept);
    const pairs = [];
    words.forEach((word, index) => {
        bar.update(index);
        const conceptWord = wordVecs[word];
        const sim = (0, math_1.similarity)(diff, conceptWord || []);
        pairs.push([word, sim]);
    });
    bar.stop();
    return pairs
        .sort(([, aSim], [, bSim]) => bSim - aSim)
        .slice(0, depth)
        .map(([w]) => w);
};
exports.getConceptualDifference = getConceptualDifference;
//# sourceMappingURL=getConceptualDifference.js.map