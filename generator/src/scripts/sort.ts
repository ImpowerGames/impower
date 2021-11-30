import fs from "fs";
import archetypes from "../input/archetypes.json";
import phrases from "../input/phrases.json";

const sortedPhrases = Array.from(new Set(phrases))
  .sort()
  .sort((a, b) => (a.length < b.length ? -1 : 1));
const phrasesPath = "./src/input/phrases.json";

fs.writeFile(phrasesPath, JSON.stringify(sortedPhrases), (err) => {
  if (err) {
    console.log("FAILED!", err);
  } else {
    console.log("EXPORTED TO: ", phrasesPath);
  }
});

const sortedArchetypes = Array.from(new Set(archetypes)).sort();
const archetypesPath = "./src/input/archetypes.json";

fs.writeFile(archetypesPath, JSON.stringify(sortedArchetypes), (err) => {
  if (err) {
    console.log("FAILED!", err);
  } else {
    console.log("EXPORTED TO: ", archetypesPath);
  }
});
