import tagTerms from "../input/tagTerms.json";
import { termVectors } from "../generated/termVectors";
import { getClosestTags } from "../utils/getClosestTags";

const result = getClosestTags(
  tagTerms,
  termVectors,
  parseInt(process.argv[2]),
  ...process.argv.slice(3)
);
console.log(result);
