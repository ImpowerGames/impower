"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getReversedMap = void 0;
const getReversedMap = (map) => {
    const reversedMap = {};
    const sortedEntries = Object.entries(map).sort(([, aValue], [, bValue]) => aValue > bValue ? 1 : -1);
    sortedEntries.forEach(([key, value]) => {
        reversedMap[value] = key;
    });
    return reversedMap;
};
exports.getReversedMap = getReversedMap;
//# sourceMappingURL=getReversedMap.js.map