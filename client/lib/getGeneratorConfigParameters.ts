import phrases from "../../generator/src/input/phrases.json";
import terms from "../../generator/src/output/terms.json";
import { GeneratorConfigParameters } from "../modules/impower-config";

const getGeneratorConfigParameters = (): GeneratorConfigParameters => {
  return {
    phrases,
    terms,
  };
};

export default getGeneratorConfigParameters;
