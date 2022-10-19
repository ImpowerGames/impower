import archetypes from "../../title-generator/src/input/archetypes.json";
import { TagConfigParameters } from "../modules/impower-config";
import colors from "../resources/json/colors.json";
import atmospheres from "../resources/json/en/atmospheres.json";
import catalysts from "../resources/json/en/catalysts.json";
import locations from "../resources/json/en/locations.json";
import moods from "../resources/json/en/moods.json";
import musicalStyles from "../resources/json/en/musicalStyles.json";
import projectTags from "../resources/json/en/projectTags.json";
import resourceTags from "../resources/json/en/resourceTags.json";
import roleTags from "../resources/json/en/roleTags.json";
import tagDisambiguations from "../resources/json/en/tagDisambiguations.json";
import visualStyles from "../resources/json/en/visualStyles.json";
import tagColorNames from "../resources/json/tagColorNames.json";
import tagIconNames from "../resources/json/tagIconNames.json";
import tagPatterns from "../resources/json/tagPatterns.json";

const getTagConfigParameters = (): TagConfigParameters => {
  return {
    archetypes,
    atmospheres,
    catalysts,
    colors,
    locations,
    moods,
    musicalStyles,
    projectTags,
    resourceTags,
    roleTags,
    tagColorNames,
    tagDisambiguations,
    tagIconNames,
    tagPatterns,
    visualStyles,
  };
};

export default getTagConfigParameters;
