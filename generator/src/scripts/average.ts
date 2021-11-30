import fs from "fs";
import archetypes from "../input/archetypes.json";
import { getAverageTerms } from "../utils/getAverageTerms";

getAverageTerms(0.4, 5000, archetypes).then((result) => {
  const path = "./src/tmp/average.json";

  fs.writeFile(path, JSON.stringify(result), (err) => {
    if (err) {
      console.log("FAILED!", err);
    } else {
      console.log("EXPORTED TO: ", path);
    }
  });
});
