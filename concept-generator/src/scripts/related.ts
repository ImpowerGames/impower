import cliProgress from "cli-progress";
import fs from "fs";
import { parse } from "yaml";
import { getKeywords } from "../utils/getKeywords";
import { getRelatedTerms } from "../utils/getRelatedTerms";

const conceptsPath = "./input/concepts.yaml";
const phrasesPath = "./src/input/phrases.txt";
const archetypesPath = "./src/input/archetypes.txt";
const termVectorsPath = "./tmp/termVectors.json";
const relatedTermsPath = "./tmp/relatedTerms.json";

const concepts = parse(fs.readFileSync(conceptsPath, "utf8"));
const phrases = fs.readFileSync(phrasesPath, "utf8").split(/\r?\n/);
const archetypes = fs.readFileSync(archetypesPath, "utf8").split(/\r?\n/);
const termVectors = JSON.parse(fs.readFileSync(termVectorsPath, "utf8"));

const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
const onProgress = (current: number, total: number) => {
  if (current < 0) {
    bar.start(total, 0);
  }
  if (current === total) {
    bar.stop();
  }
};

getRelatedTerms(
  concepts,
  termVectors,
  Object.keys(getKeywords([...phrases, ...archetypes])),
  0.4,
  4,
  process.argv.slice(2),
  onProgress
).then((result) => {
  fs.writeFile(relatedTermsPath, JSON.stringify(result), (err) => {
    if (err) {
      console.log("FAILED!", err);
    } else {
      console.log("EXPORTED TO: ", relatedTermsPath);
    }
  });
});
