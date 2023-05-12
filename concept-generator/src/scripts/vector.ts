import fs from "fs";
import { parse } from "yaml";
import terms from "../output/terms.json";
import { getWordVectors } from "../utils/getWordVectors";

const concepts = parse(fs.readFileSync("./input/concepts.yaml", "utf8"));

const include = (word: string) =>
  Boolean(
    (concepts as Record<string, string[]>)[word] ||
      (terms as Record<string, string[]>)[word]
  );

getWordVectors(include).then((result) => {
  const definition = "export const termVectors = ";
  const path = "./tmp/termVectors.ts";
  fs.writeFile(path, definition + JSON.stringify(result), (err) => {
    if (err) {
      console.log("FAILED!", err);
    } else {
      console.log("EXPORTED TO: ", path);
    }
  });
});
