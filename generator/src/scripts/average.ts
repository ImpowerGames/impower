import fs from "fs";
import locations from "../../../client/resources/json/en/locations.json";
import { getAverageTerms } from "../utils/getAverageTerms";

getAverageTerms(0.4, 5000, locations).then((result) => {
  const path = "./src/tmp/average.json";

  fs.writeFile(path, JSON.stringify(result), (err) => {
    if (err) {
      console.log("FAILED!", err);
    } else {
      console.log("EXPORTED TO: ", path);
    }
  });
});
