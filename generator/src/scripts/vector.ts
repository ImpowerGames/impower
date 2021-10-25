import fs from "fs";
import tagTerms from "../input/tagTerms.json";
import { keywords } from "../generated/keywords";
import { getTermVectors } from "../utils/getTermVectors";

const include = (word: string) => Boolean(tagTerms[word] || keywords[word]);

getTermVectors(tagTerms, include).then((result) => {
  const definition = "export const termVectors = ";
  const path = "./src/generated/termVectors.ts";
  fs.writeFile(path, definition + JSON.stringify(result), (err) => {
    if (err) {
      console.log("FAILED!", err);
    } else {
      console.log("EXPORTED TO: ", path);
    }
  });
});
