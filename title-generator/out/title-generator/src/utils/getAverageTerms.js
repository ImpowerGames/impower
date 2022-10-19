"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAverageTerms = void 0;
const cli_progress_1 = __importDefault(require("cli-progress"));
const fs_1 = __importDefault(require("fs"));
const readline_1 = __importDefault(require("readline"));
const math_1 = require("./math");
const getAverageTerms = async (threshold = 0.4, limit = 100, words, vector, termVectors) => {
    const multibar = new cli_progress_1.default.MultiBar({
        clearOnComplete: false,
        hideCursor: true,
    }, cli_progress_1.default.Presets.shades_classic);
    const vectorCount = 2519371;
    const termVectorEntries = termVectors ? Object.entries(termVectors) : [];
    const progressTotal = termVectorEntries?.length || vectorCount;
    const bar1 = multibar.create(progressTotal, vector ? progressTotal : 0);
    const bar2 = multibar.create(progressTotal, 0);
    const path = "./src/data/wiki.en.vec";
    let wordVecs = {};
    if (!vector) {
        const fs1 = fs_1.default.createReadStream(path);
        const rl1 = readline_1.default.createInterface({
            input: fs1,
            crlfDelay: Infinity,
        });
        for await (const line of rl1) {
            bar1.increment();
            const parts = line.split(" ");
            const word = parts[0];
            const wordVec = parts
                .slice(1)
                .map((n) => parseFloat(n))
                .filter((x) => !Number.isNaN(x));
            if (word && words.includes(word)) {
                wordVecs[word] = wordVec;
            }
        }
        rl1.close();
        rl1.removeAllListeners();
    }
    const averageVector = vector || (0, math_1.average)(Object.values(wordVecs));
    wordVecs = {};
    const relatedWords = [];
    let orderedRelatedWords = [];
    if (termVectorEntries?.length > 0) {
        termVectorEntries.forEach(([word, wordVec], index) => {
            bar2.increment();
            const sim = (0, math_1.similarity)(wordVec, averageVector);
            if (!words.includes(word) && sim > threshold) {
                relatedWords.push([word, index, sim]);
            }
        });
        orderedRelatedWords = relatedWords
            .sort(([, , aSim], [, , bSim]) => bSim - aSim)
            .slice(0, limit)
            .map(([word]) => word);
    }
    else {
        const fs2 = fs_1.default.createReadStream(path);
        const rl2 = readline_1.default.createInterface({
            input: fs2,
            crlfDelay: Infinity,
        });
        let index = 0;
        for await (const line of rl2) {
            bar2.increment();
            const parts = line.split(" ");
            const word = parts[0];
            const wordVec = parts
                .slice(1)
                .map((n) => parseFloat(n))
                .filter((x) => !Number.isNaN(x));
            const sim = (0, math_1.similarity)(wordVec, averageVector);
            if (word && !words.includes(word) && sim > threshold) {
                relatedWords.push([word, index, sim]);
            }
            index += 1;
        }
        rl2.close();
        rl2.removeAllListeners();
        orderedRelatedWords = relatedWords
            .sort(([, , aSim], [, , bSim]) => bSim - aSim)
            .slice(0, limit)
            .sort(([, aIndex], [, bIndex]) => aIndex - bIndex)
            .map(([word]) => word);
    }
    multibar.stop();
    return { related: orderedRelatedWords, vector: averageVector };
};
exports.getAverageTerms = getAverageTerms;
//# sourceMappingURL=getAverageTerms.js.map