import fs from "fs";
import YAML from "yaml";
import { getCleanedConcepts } from "./utils/getCleanedConcepts";

const conceptsPath = "./src/input/concepts.yaml";

const concepts = YAML.parse(fs.readFileSync(conceptsPath, "utf8"));

const result = getCleanedConcepts(
  concepts,
  process.argv[2] as "alphabetical" | "term-count"
);

fs.writeFile(conceptsPath, YAML.stringify(result), (err) => {
  if (err) {
    console.log("FAILED!", err);
  } else {
    console.log("EXPORTED TO: ", conceptsPath);
  }
});
