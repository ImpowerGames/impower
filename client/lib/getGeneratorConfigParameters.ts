import archetypes from "../../title-generator/src/input/archetypes.json";
import phrases from "../../title-generator/src/input/phrases.json";
import terms from "../../title-generator/src/output/terms.json";
import { GeneratorConfigParameters } from "../modules/impower-config";

const getGeneratorConfigParameters = (): GeneratorConfigParameters => {
  return {
    phrases,
    archetypes,
    terms,
  };
};

export default getGeneratorConfigParameters;
