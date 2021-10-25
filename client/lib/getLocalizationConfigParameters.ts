import { LocalizationConfigParameters } from "../modules/impower-config";
import abbreviations from "../resources/json/en/abbreviations.json";
import capitalizations from "../resources/json/en/capitalizations.json";
import messages from "../resources/json/en/messages.json";
import regexes from "../resources/json/en/regexes.json";

const getLocalizationConfigParameters = (): LocalizationConfigParameters => {
  return {
    abbreviations,
    capitalizations,
    messages,
    regexes,
  };
};

export default getLocalizationConfigParameters;
