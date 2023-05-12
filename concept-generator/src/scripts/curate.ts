import fs from "fs";
import { getCuratedPhrases } from "../utils/getCuratedPhrases";

const phrasesPath = "./input/phrases.txt";
const termsPath = "./output/terms.json";

const phrases = fs.readFileSync(phrasesPath, "utf8").split(/\r?\n/);
const terms = JSON.parse(fs.readFileSync(termsPath, "utf8"));

const randomTestPhrase = process.argv[2] ? process.argv[2] : undefined;

getCuratedPhrases(phrases, terms, randomTestPhrase, console.log);
