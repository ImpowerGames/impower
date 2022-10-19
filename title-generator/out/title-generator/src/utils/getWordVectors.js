"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWordVectors = void 0;
const cli_progress_1 = __importDefault(require("cli-progress"));
const fs_1 = __importDefault(require("fs"));
const readline_1 = __importDefault(require("readline"));
const getWordVectors = async (include) => {
    const bar = new cli_progress_1.default.SingleBar({}, cli_progress_1.default.Presets.shades_classic);
    const path = "./src/data/wiki.en.vec";
    const fileStream = fs_1.default.createReadStream(path);
    const wordVecs = {};
    const rl = readline_1.default.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
    });
    const vectorCount = 2519371;
    bar.start(vectorCount, 0);
    for await (const line of rl) {
        bar.increment();
        const parts = line.split(" ");
        const word = parts[0];
        const vector = parts
            .slice(1)
            .map((n) => parseFloat(n))
            .filter((x) => !Number.isNaN(x));
        if (word) {
            if (!include || include(word)) {
                wordVecs[word] = vector;
            }
        }
    }
    bar.stop();
    return wordVecs;
};
exports.getWordVectors = getWordVectors;
//# sourceMappingURL=getWordVectors.js.map