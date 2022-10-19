"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const musicalStyles_json_1 = __importDefault(require("../../../client/resources/json/en/musicalStyles.json"));
const getAverageTerms_1 = require("../utils/getAverageTerms");
(0, getAverageTerms_1.getAverageTerms)(0.4, 5000, musicalStyles_json_1.default).then((result) => {
    const path = "./src/tmp/average.json";
    fs_1.default.writeFile(path, JSON.stringify(result), (err) => {
        if (err) {
            console.log("FAILED!", err);
        }
        else {
            console.log("EXPORTED TO: ", path);
        }
    });
});
//# sourceMappingURL=average.js.map