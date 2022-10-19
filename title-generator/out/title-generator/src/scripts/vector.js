"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const tagTerms_json_1 = __importDefault(require("../input/tagTerms.json"));
const terms_json_1 = __importDefault(require("../output/terms.json"));
const getWordVectors_1 = require("../utils/getWordVectors");
const include = (word) => Boolean(tagTerms_json_1.default[word] ||
    terms_json_1.default[word]);
(0, getWordVectors_1.getWordVectors)(include).then((result) => {
    const definition = "export const termVectors = ";
    const path = "./src/generated/termVectors.ts";
    fs_1.default.writeFile(path, definition + JSON.stringify(result), (err) => {
        if (err) {
            console.log("FAILED!", err);
        }
        else {
            console.log("EXPORTED TO: ", path);
        }
    });
});
//# sourceMappingURL=vector.js.map