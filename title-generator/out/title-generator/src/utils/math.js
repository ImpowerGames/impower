"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.round = exports.mag = exports.similarity = exports.average = exports.difference = exports.sum = void 0;
const sum = (vectors) => {
    const sum = [];
    vectors.forEach((v) => {
        if (v) {
            v.forEach((p, i) => {
                sum[i] = (sum[i] || 0) + p;
            });
        }
    });
    return sum;
};
exports.sum = sum;
const difference = (v1, v2) => {
    const difference = [];
    for (let i = 0; i < v1.length; i += 1) {
        difference[i] = (v1[i] || 0) - (v2[i] || 0);
    }
    return difference;
};
exports.difference = difference;
const average = (vectors) => {
    const validVectors = vectors.filter((v) => Boolean(v));
    const count = validVectors.length;
    const avg = [];
    (0, exports.sum)(validVectors).forEach((p, i) => {
        avg[i] = p / count;
    });
    return avg;
};
exports.average = average;
const similarity = (v1, v2) => {
    if (!v1 || !v2) {
        return 0;
    }
    return Math.abs(v1.reduce((sum, a, idx) => {
        return sum + a * (v2[idx] || 0);
    }, 0) /
        ((0, exports.mag)(v1) * (0, exports.mag)(v2)));
};
exports.similarity = similarity;
const mag = (a) => {
    return Math.sqrt(a.reduce((sum, val) => {
        return sum + val * val;
    }, 0));
};
exports.mag = mag;
const round = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
exports.round = round;
//# sourceMappingURL=math.js.map