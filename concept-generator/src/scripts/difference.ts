import fs from "fs";
import { getConceptualDifference } from "../utils/getConceptualDifference";

const json = fs.readFileSync("./tmp/termVectors.json", "utf8");
const termVectors = JSON.parse(json);

const result = getConceptualDifference(
  process.argv[2] || "",
  process.argv[3] || "",
  termVectors,
  process.argv[4] ? Number.parseInt(process.argv[4] || "30") : undefined
);
console.log(result);
