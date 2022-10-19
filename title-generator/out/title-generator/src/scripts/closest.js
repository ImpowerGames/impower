"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const termVectors_1 = require("../generated/termVectors");
const tagTerms_json_1 = __importDefault(require("../input/tagTerms.json"));
const getClosestTags_1 = require("../utils/getClosestTags");
const result = (0, getClosestTags_1.getClosestTags)(tagTerms_json_1.default, termVectors_1.termVectors, Number.parseInt(process.argv[2] || "5"), ...process.argv.slice(3));
console.log(result);
//# sourceMappingURL=closest.js.map