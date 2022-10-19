"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const termVectors_1 = require("../generated/termVectors");
const getConceptualExamples_1 = require("../utils/getConceptualExamples");
const result = (0, getConceptualExamples_1.getConceptualExamples)(termVectors_1.termVectors, ...process.argv.slice(2));
console.log(result);
//# sourceMappingURL=concept.js.map