"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const phrases_json_1 = __importDefault(require("../input/phrases.json"));
const getKeywords_1 = require("../utils/getKeywords");
const result = (0, getKeywords_1.getKeywords)(phrases_json_1.default, true);
const definition = "export const keywords: {[word: string]: number} = ";
const path = "./src/generated/keywords.ts";
fs_1.default.writeFile(path, definition + JSON.stringify(result), (err) => {
    if (err) {
        console.log("FAILED!", err);
    }
    else {
        console.log("EXPORTED TO: ", path);
    }
});
//# sourceMappingURL=keywords.js.map