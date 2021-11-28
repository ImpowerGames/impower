import { TagConfigParameters } from "../modules/impower-config";
import colors from "../resources/json/colors.json";
import archetypes from "../resources/json/en/archetypes.json";
import catalysts from "../resources/json/en/catalysts.json";
import moods from "../resources/json/en/moods.json";
import projectTags from "../resources/json/en/projectTags.json";
import resourceTags from "../resources/json/en/resourceTags.json";
import roleTags from "../resources/json/en/roleTags.json";
import tagDisambiguations from "../resources/json/en/tagDisambiguations.json";
import tagColorNames from "../resources/json/tagColorNames.json";
import tagIconNames from "../resources/json/tagIconNames.json";
import tagPatterns from "../resources/json/tagPatterns.json";

const getTagConfigParameters = (): TagConfigParameters => {
  return {
    colors,
    projectTags,
    moods,
    catalysts,
    archetypes,
    resourceTags,
    roleTags,
    tagColorNames,
    tagDisambiguations,
    tagIconNames,
    tagPatterns,
  };
};

export default getTagConfigParameters;
