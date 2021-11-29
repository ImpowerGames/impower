import fs from "fs";
import archetypes from "../../../client/resources/json/en/archetypes.json";
import { termVectors } from "../generated/termVectors";
import phrases from "../input/phrases.json";
import tagTerms from "../input/tagTerms.json";
import { getKeywords } from "../utils/getKeywords";
import { getRelatedTerms } from "../utils/getRelatedTerms";

getRelatedTerms(
  tagTerms,
  termVectors,
  Object.keys(getKeywords([...phrases, ...archetypes])),
  0.4,
  4,
  ...process.argv.slice(2)
).then((result) => {
  const path = "./src/tmp/relatedTerms.json";

  fs.writeFile(path, JSON.stringify(result), (err) => {
    if (err) {
      console.log("FAILED!", err);
    } else {
      console.log("EXPORTED TO: ", path);
    }
  });
});
