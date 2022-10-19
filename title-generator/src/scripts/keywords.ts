import fs from "fs";
import phrases from "../input/phrases.json";
import { getKeywords } from "../utils/getKeywords";

const result = getKeywords(phrases, true);
const definition = "export const keywords: {[word: string]: number} = ";
const path = "./src/generated/keywords.ts";
fs.writeFile(path, definition + JSON.stringify(result), (err) => {
  if (err) {
    console.log("FAILED!", err);
  } else {
    console.log("EXPORTED TO: ", path);
  }
});
