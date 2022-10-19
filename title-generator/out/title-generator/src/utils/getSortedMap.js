"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSortedMap = void 0;
const getSortedMap = (map, sortByValue = false) => {
    const sortedMap = {};
    const sortedEntries = Object.entries(map).sort(([aKey, aValue], [bKey, bValue]) => {
        if (sortByValue) {
            if (Array.isArray(aValue) && Array.isArray(bValue)) {
                return aValue.length > bValue.length ? 1 : -1;
            }
            return aValue > bValue ? 1 : -1;
        }
        return aKey > bKey ? 1 : -1;
    });
    sortedEntries.forEach(([key, value]) => {
        sortedMap[key] = value;
    });
    return sortedMap;
};
exports.getSortedMap = getSortedMap;
//# sourceMappingURL=getSortedMap.js.map