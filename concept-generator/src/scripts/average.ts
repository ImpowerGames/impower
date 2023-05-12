import fs from "fs";
import musicalStyles from "../../../client/resources/json/en/musicalStyles.json";
import { getAverageTerms } from "../utils/getAverageTerms";

getAverageTerms(0.4, 5000, musicalStyles).then((result) => {
  const path = "./tmp/average.json";

  fs.writeFile(path, JSON.stringify(result), (err) => {
    if (err) {
      console.log("FAILED!", err);
    } else {
      console.log("EXPORTED TO: ", path);
    }
  });
});
