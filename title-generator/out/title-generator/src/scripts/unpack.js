"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const archetypes_json_1 = __importDefault(require("../input/archetypes.json"));
const phrases_json_1 = __importDefault(require("../input/phrases.json"));
const tagTerms_json_1 = __importDefault(require("../input/tagTerms.json"));
const getTermTags_1 = require("../utils/getTermTags");
const result = (0, getTermTags_1.getTermTags)(tagTerms_json_1.default, Array.from(new Set([...phrases_json_1.default, ...archetypes_json_1.default])));
const path = "./src/output/terms.json";
fs_1.default.writeFile(path, JSON.stringify(result), (err) => {
    if (err) {
        console.log("FAILED!", err);
    }
    else {
        console.log("EXPORTED TO: ", path);
    }
});
//# sourceMappingURL=unpack.js.map