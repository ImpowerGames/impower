import fs from "fs";
import YAML from "yaml";
import { getWordVectors } from "./cli/getWordVectors";

const modelPath = "./models/wiki.en.vec";
const conceptsPath = "./input/concepts.yaml";
const termsPath = "./output/terms.json";
const termVectorsPath = "./tmp/termVectors.ts";

const concepts = YAML.parse(fs.readFileSync(conceptsPath, "utf8"));
const terms = JSON.parse(fs.readFileSync(termsPath, "utf8"));

const include = (word: string) =>
  Boolean(
    (concepts as Record<string, string[]>)[word] ||
      (terms as Record<string, string[]>)[word]
  );

getWordVectors(modelPath, include).then((result) => {
  const definition = "export const termVectors = ";
  fs.writeFile(
    termVectorsPath,
    definition + JSON.stringify(result, null, 2),
    (err) => {
      if (err) {
        console.log("FAILED!", err);
      } else {
        console.log("EXPORTED TO: ", termVectorsPath);
      }
    }
  );
});
