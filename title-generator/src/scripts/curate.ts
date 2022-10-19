import phrases from "../input/phrases.json";
import terms from "../output/terms.json";
import { getCuratedPhrases } from "../utils/getCuratedPhrases";

const randomTestPhrase = process.argv[2] ? process.argv[2] : undefined;

getCuratedPhrases(phrases, terms, randomTestPhrase);
