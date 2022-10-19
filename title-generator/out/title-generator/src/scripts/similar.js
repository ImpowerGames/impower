"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const phrases_json_1 = __importDefault(require("../input/phrases.json"));
const keywords_1 = require("../generated/keywords");
const getSimilarPhrases_1 = require("../utils/getSimilarPhrases");
const similarPhrases = (0, getSimilarPhrases_1.getSimilarPhrases)(phrases_json_1.default.sort(), keywords_1.keywords);
const similarPhrasesDefinition = "export const similarPhrases: { [phrase: string]: [string, number][] } = ";
const similarPhrasesPath = "./src/tmp/similarPhrases.ts";
fs_1.default.writeFile(similarPhrasesPath, similarPhrasesDefinition + JSON.stringify(similarPhrases), (err) => {
    if (err) {
        console.log("FAILED!", err);
    }
    else {
        console.log("EXPORTED TO: ", similarPhrasesPath);
    }
});
//# sourceMappingURL=similar.js.map