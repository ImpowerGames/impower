import fs from "fs";
import { parse } from "yaml";
import { getWordVectors } from "../cli/getWordVectors";

const conceptsPath = "./input/concepts.yaml";
const termsPath = "./output/terms.json";
const termVectorsPath = "./tmp/termVectors.ts";

const concepts = parse(fs.readFileSync(conceptsPath, "utf8"));
const terms = JSON.parse(fs.readFileSync(termsPath, "utf8"));

const include = (word: string) =>
  Boolean(
    (concepts as Record<string, string[]>)[word] ||
      (terms as Record<string, string[]>)[word]
  );

getWordVectors(include).then((result) => {
  const definition = "export const termVectors = ";
  fs.writeFile(termVectorsPath, definition + JSON.stringify(result), (err) => {
    if (err) {
      console.log("FAILED!", err);
    } else {
      console.log("EXPORTED TO: ", termVectorsPath);
    }
  });
});
