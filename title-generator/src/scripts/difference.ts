import { termVectors } from "../generated/termVectors";
import { getConceptualDifference } from "../utils/getConceptualDifference";

const result = getConceptualDifference(
  process.argv[2] || "",
  process.argv[3] || "",
  termVectors,
  process.argv[4] ? Number.parseInt(process.argv[4] || "30") : undefined
);
console.log(result);
