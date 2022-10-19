"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCleanedTerm = void 0;
const getCleanedTerm = (term) => {
    return term
        .toLowerCase()
        .replace(/["^$%&\\(),.:;<=[\\\]`{|}]/g, "")
        .replace(/[>_~]/g, "")
        .replace(/[/]/g, " / ")
        .replace(/[+]/g, " + ")
        .replace(/[!]/g, " ! ")
        .replace(/[?]/g, " ? ")
        .replace(/[-]/g, " ");
};
exports.getCleanedTerm = getCleanedTerm;
//# sourceMappingURL=getCleanedTerm.js.map