"use strict";
const personalTerms = [
    "he",
    "he'd",
    "he's",
    "he'll",
    "i",
    "i'd",
    "i'll",
    "i'm",
    "i've",
    "it",
    "it's",
    "it'll",
    "it'd",
    "me",
    "mine",
    "my",
    "myself",
    "our",
    "ours",
    "she",
    "she'd",
    "she's",
    "she'll",
    "that",
    "that's",
    "that'll",
    "that'd",
    "their",
    "they",
    "they'd",
    "they'll",
    "they're",
    "this",
    "we",
    "we'd",
    "we'll",
    "we're",
    "we've",
    "you",
    "you're",
    "your",
    "yourself",
];
const casualTerms = ["quite", "please", "gonna", "freaking"];
const interestingPunctuation = ["!", "?"];
const conversationalTerms = [
    ...personalTerms,
    ...casualTerms,
    ...interestingPunctuation,
];
const getConversationalWeight = (phrase) => {
    const words = phrase.split(" ");
    const isConversational = conversationalTerms.some((c) => words.includes(c) ||
        words.some((word) => word.includes("'") && !word.endsWith("'s")));
    return isConversational ? 0.05 : 0;
};
//# sourceMappingURL=getConversationalWeight.js.map