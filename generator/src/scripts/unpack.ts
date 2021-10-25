import fs from "fs";
import tagTerms from "../input/tagTerms.json";
import phrases from "../input/phrases.json";
import { getTermTags } from "../utils/getTermTags";

const result = getTermTags(tagTerms, phrases);
const path = "./src/output/terms.json";

fs.writeFile(path, JSON.stringify(result), (err) => {
  if (err) {
    console.log("FAILED!", err);
  } else {
    console.log("EXPORTED TO: ", path);
  }
});
