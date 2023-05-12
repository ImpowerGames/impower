import fs from "fs";

const phrasesPath = "./src/input/phrases.txt";
const archetypesPath = "./src/input/archetypes.txt";

const phrases = fs.readFileSync(phrasesPath, "utf8").split(/\r?\n/);
const archetypes = fs.readFileSync(archetypesPath, "utf8").split(/\r?\n/);

const sortedPhrases = Array.from(new Set(phrases))
  .sort()
  .sort((a, b) => (a.length < b.length ? -1 : 1));
fs.writeFile(phrasesPath, JSON.stringify(sortedPhrases), (err) => {
  if (err) {
    console.log("FAILED!", err);
  } else {
    console.log("EXPORTED TO: ", phrasesPath);
  }
});

const sortedArchetypes = Array.from(new Set(archetypes)).sort();
fs.writeFile(archetypesPath, JSON.stringify(sortedArchetypes), (err) => {
  if (err) {
    console.log("FAILED!", err);
  } else {
    console.log("EXPORTED TO: ", archetypesPath);
  }
});
