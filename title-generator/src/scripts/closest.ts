import { termVectors } from "../generated/termVectors";
import tagTerms from "../input/tagTerms.json";
import { getClosestTags } from "../utils/getClosestTags";

const result = getClosestTags(
  tagTerms,
  termVectors,
  Number.parseInt(process.argv[2] || "5"),
  ...process.argv.slice(3)
);
console.log(result);
