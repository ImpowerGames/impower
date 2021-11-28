import fs from "fs";
import archetypes from "../../../client/resources/json/en/archetypes.json";
import catalysts from "../../../client/resources/json/en/catalysts.json";
import moods from "../../../client/resources/json/en/moods.json";
import phrases from "../input/phrases.json";
import tagTerms from "../input/tagTerms.json";
import { getTermTags } from "../utils/getTermTags";

const result = getTermTags(
  tagTerms,
  Array.from(
    new Set([
      ...phrases,
      ...catalysts,
      ...archetypes,
      ...Object.values(moods).flatMap((x) => x.flatMap((x) => x)),
    ])
  )
);
const path = "./src/output/terms.json";

fs.writeFile(path, JSON.stringify(result), (err) => {
  if (err) {
    console.log("FAILED!", err);
  } else {
    console.log("EXPORTED TO: ", path);
  }
});
