import fs from "fs";
import musicalStyles from "../../../client/resources/json/en/musicalStyles.json";
import { getAverageTerms } from "../cli/getAverageTerms";

const averagePath = "./tmp/average.json";

getAverageTerms(0.4, 5000, musicalStyles).then((result) => {
  fs.writeFile(averagePath, JSON.stringify(result), (err) => {
    if (err) {
      console.log("FAILED!", err);
    } else {
      console.log("EXPORTED TO: ", averagePath);
    }
  });
});
