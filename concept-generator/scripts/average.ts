import fs from "fs";
import musicalStyles from "../../client/resources/json/en/musicalStyles.json";
import { getAverageTerms } from "./cli/getAverageTerms";

const modelPath = "./models/wiki.en.vec";
const averagePath = "./tmp/average.json";

getAverageTerms(modelPath, 0.4, 5000, musicalStyles).then((result) => {
  fs.writeFile(averagePath, JSON.stringify(result, null, 2), (err) => {
    if (err) {
      console.log("FAILED!", err);
    } else {
      console.log("EXPORTED TO: ", averagePath);
    }
  });
});
