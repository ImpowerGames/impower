import phrases from "../../generator/src/input/phrases.json";
import terms from "../../generator/src/output/terms.json";
import { GeneratorConfigParameters } from "../modules/impower-config";
import moods from "../resources/json/en/moods.json";

const getGeneratorConfigParameters = (): GeneratorConfigParameters => {
  return {
    moods,
    phrases,
    terms,
  };
};

export default getGeneratorConfigParameters;
