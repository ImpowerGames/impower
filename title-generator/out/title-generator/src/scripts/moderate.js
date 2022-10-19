"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const phrases_json_1 = __importDefault(require("../input/phrases.json"));
const terms_json_1 = __importDefault(require("../output/terms.json"));
const getCuratedPhrases_1 = require("../utils/getCuratedPhrases");
const randomTestPhrase = process.argv[2] ? process.argv[2] : undefined;
const curatedPhrases = (0, getCuratedPhrases_1.getCuratedPhrases)(phrases_json_1.default, terms_json_1.default, randomTestPhrase);
const incompatibleTags = [
    [
        ["love", "marriage"],
        ["family", "raising", "young"],
    ],
    [["coming-of-age", "academia"], ["shooter"]],
];
Object.entries(curatedPhrases).forEach(([phrase, phraseTags]) => {
    let moderatedPhraseTags = phraseTags;
    incompatibleTags.forEach((lists) => {
        const incompatiblePhraseTags = lists.map((list) => list.filter((incompatibleTag) => phraseTags.includes(incompatibleTag)));
        const incompatibleCounts = incompatiblePhraseTags.map((lists) => lists.length);
        if (incompatibleCounts.filter((count) => count > 0).length > 1) {
            const mainIncompatibleTags = lists.flatMap((x) => x);
            moderatedPhraseTags = moderatedPhraseTags.filter((t) => !mainIncompatibleTags.includes(t));
        }
    });
    if (phraseTags.length !== moderatedPhraseTags.length) {
        console.log("POSSIBLY INAPPROPRIATE", phrase, phraseTags.filter((t) => !moderatedPhraseTags.includes(t)));
    }
});
//# sourceMappingURL=moderate.js.map