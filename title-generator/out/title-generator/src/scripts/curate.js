"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const phrases_json_1 = __importDefault(require("../input/phrases.json"));
const terms_json_1 = __importDefault(require("../output/terms.json"));
const getCuratedPhrases_1 = require("../utils/getCuratedPhrases");
const randomTestPhrase = process.argv[2] ? process.argv[2] : undefined;
(0, getCuratedPhrases_1.getCuratedPhrases)(phrases_json_1.default, terms_json_1.default, randomTestPhrase);
//# sourceMappingURL=curate.js.map