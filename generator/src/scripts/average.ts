import fs from "fs";
import archetypes from "../../../client/resources/json/en/archetypes.json";
import tagTerms from "../input/tagTerms.json";
import { getAverageTerms } from "../utils/getAverageTerms";

getAverageTerms(tagTerms, 0.2, 100, ...archetypes).then((result) => {
  const path = "./src/tmp/average.json";

  fs.writeFile(path, JSON.stringify(result), (err) => {
    if (err) {
      console.log("FAILED!", err);
    } else {
      console.log("EXPORTED TO: ", path);
    }
  });
});
