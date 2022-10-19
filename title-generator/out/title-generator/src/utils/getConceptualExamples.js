"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConceptualExamples = void 0;
const cli_progress_1 = __importDefault(require("cli-progress"));
const math_1 = require("./math");
const getConceptualExamples = (wordVecs, ...targetWords) => {
    const bar = new cli_progress_1.default.SingleBar({}, cli_progress_1.default.Presets.shades_classic);
    const words = Object.keys(wordVecs);
    bar.start(words.length, 0);
    const conceptVecs = targetWords.map((word) => wordVecs[word] || []);
    const targetConcept = (0, math_1.average)(conceptVecs);
    if (!targetConcept) {
        throw new Error(`Vector does not exist for: ${targetWords[0]}`);
    }
    const pairs = [];
    words.forEach((word, index) => {
        bar.update(index);
        const conceptWord = wordVecs[word] || [];
        const sim = (0, math_1.similarity)(targetConcept, conceptWord);
        pairs.push([word, sim]);
    });
    bar.stop();
    return pairs
        .sort(([, aSim], [, bSim]) => bSim - aSim)
        .slice(0, 30)
        .map(([w]) => w);
};
exports.getConceptualExamples = getConceptualExamples;
//# sourceMappingURL=getConceptualExamples.js.map