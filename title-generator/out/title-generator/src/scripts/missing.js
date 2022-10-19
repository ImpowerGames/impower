"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const archetypes_json_1 = __importDefault(require("../input/archetypes.json"));
const terms_json_1 = __importDefault(require("../output/terms.json"));
const getKeywords_1 = require("../utils/getKeywords");
const result = (0, getKeywords_1.getKeywords)(archetypes_json_1.default, true);
const missingTerms = [];
Object.entries(result).forEach(([word]) => {
    if (!terms_json_1.default[word]) {
        missingTerms.push(word);
    }
});
const path = "./src/tmp/missing.json";
fs_1.default.writeFile(path, JSON.stringify(missingTerms.sort()), (err) => {
    if (err) {
        console.log("FAILED!", err);
    }
    else {
        console.log("EXPORTED TO: ", path);
    }
});
//# sourceMappingURL=missing.js.map