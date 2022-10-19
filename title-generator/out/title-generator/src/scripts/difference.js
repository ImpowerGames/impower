"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const termVectors_1 = require("../generated/termVectors");
const getConceptualDifference_1 = require("../utils/getConceptualDifference");
const result = (0, getConceptualDifference_1.getConceptualDifference)(process.argv[2] || "", process.argv[3] || "", termVectors_1.termVectors, process.argv[4] ? Number.parseInt(process.argv[4] || "30") : undefined);
console.log(result);
//# sourceMappingURL=difference.js.map