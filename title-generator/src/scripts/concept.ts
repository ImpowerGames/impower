import { termVectors } from "../generated/termVectors";
import { getConceptualExamples } from "../utils/getConceptualExamples";

const result = getConceptualExamples(termVectors, ...process.argv.slice(2));
console.log(result);
