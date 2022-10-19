"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const tagTerms_json_1 = __importDefault(require("../input/tagTerms.json"));
const getCleanedTagTerms_1 = require("../utils/getCleanedTagTerms");
const result = (0, getCleanedTagTerms_1.getCleanedTagTerms)(tagTerms_json_1.default, process.argv[2]);
const path = "./src/input/tagTerms.json";
fs_1.default.writeFile(path, JSON.stringify(result), (err) => {
    if (err) {
        console.log("FAILED!", err);
    }
    else {
        console.log("EXPORTED TO: ", path);
    }
});
//# sourceMappingURL=clean.js.map