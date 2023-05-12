import fs from "fs";
import { getConceptualExamples } from "../utils/getConceptualExamples";

const json = fs.readFileSync("./tmp/termVectors.json", "utf8");
const termVectors = JSON.parse(json);

const result = getConceptualExamples(termVectors, ...process.argv.slice(2));
console.log(result);
