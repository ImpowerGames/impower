"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const termVectors_1 = require("../generated/termVectors");
const archetypes_json_1 = __importDefault(require("../input/archetypes.json"));
const phrases_json_1 = __importDefault(require("../input/phrases.json"));
const tagTerms_json_1 = __importDefault(require("../input/tagTerms.json"));
const getKeywords_1 = require("../utils/getKeywords");
const getRelatedTerms_1 = require("../utils/getRelatedTerms");
(0, getRelatedTerms_1.getRelatedTerms)(tagTerms_json_1.default, termVectors_1.termVectors, Object.keys((0, getKeywords_1.getKeywords)([...phrases_json_1.default, ...archetypes_json_1.default])), 0.4, 4, ...process.argv.slice(2)).then((result) => {
    const path = "./src/tmp/relatedTerms.json";
    fs_1.default.writeFile(path, JSON.stringify(result), (err) => {
        if (err) {
            console.log("FAILED!", err);
        }
        else {
            console.log("EXPORTED TO: ", path);
        }
    });
});
//# sourceMappingURL=related.js.map