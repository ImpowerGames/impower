import fs from "fs";
import { parse } from "yaml";
import { getCleanedConcepts } from "./utils/getCleanedConcepts";

const conceptsPath = "./src/input/concepts.yaml";

const concepts = parse(fs.readFileSync(conceptsPath, "utf8"));

const result = getCleanedConcepts(
  concepts,
  process.argv[2] as "alphabetical" | "term-count"
);

fs.writeFile(conceptsPath, JSON.stringify(result), (err) => {
  if (err) {
    console.log("FAILED!", err);
  } else {
    console.log("EXPORTED TO: ", conceptsPath);
  }
});
