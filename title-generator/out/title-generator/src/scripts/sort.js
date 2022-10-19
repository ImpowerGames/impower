"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const archetypes_json_1 = __importDefault(require("../input/archetypes.json"));
const phrases_json_1 = __importDefault(require("../input/phrases.json"));
const sortedPhrases = Array.from(new Set(phrases_json_1.default))
    .sort()
    .sort((a, b) => (a.length < b.length ? -1 : 1));
const phrasesPath = "./src/input/phrases.json";
fs_1.default.writeFile(phrasesPath, JSON.stringify(sortedPhrases), (err) => {
    if (err) {
        console.log("FAILED!", err);
    }
    else {
        console.log("EXPORTED TO: ", phrasesPath);
    }
});
const sortedArchetypes = Array.from(new Set(archetypes_json_1.default)).sort();
const archetypesPath = "./src/input/archetypes.json";
fs_1.default.writeFile(archetypesPath, JSON.stringify(sortedArchetypes), (err) => {
    if (err) {
        console.log("FAILED!", err);
    }
    else {
        console.log("EXPORTED TO: ", archetypesPath);
    }
});
//# sourceMappingURL=sort.js.map