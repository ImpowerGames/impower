"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUniqueArray = void 0;
const getUniqueArray = (arr) => {
    return Array.from(new Set(arr.map((x) => x.toLowerCase()))).sort();
};
exports.getUniqueArray = getUniqueArray;
//# sourceMappingURL=getUniqueArray.js.map