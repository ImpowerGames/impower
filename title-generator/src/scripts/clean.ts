import fs from "fs";
import tagTerms from "../input/tagTerms.json";
import { getCleanedTagTerms } from "../utils/getCleanedTagTerms";

const result = getCleanedTagTerms(tagTerms, process.argv[2] as "alphabetical" | "term-count");
const path = "./src/input/tagTerms.json";

fs.writeFile(path, JSON.stringify(result), (err) => {
  if (err) {
    console.log("FAILED!", err);
  } else {
    console.log("EXPORTED TO: ", path);
  }
});
