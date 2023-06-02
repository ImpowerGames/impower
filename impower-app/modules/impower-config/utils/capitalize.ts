import capitalizations from "../../../resources/json/en/capitalizations.json";
import ConfigCache from "../classes/configCache";

export const capitalize = (name: string, separator = " "): string => {
  const configCapitalizations =
    ConfigCache.instance.params?.capitalizations || capitalizations;

  if (!name || typeof name !== "string") {
    return name;
  }
  const separatedSentence = name.split(separator);
  for (let i = 0; i < separatedSentence.length; i += 1) {
    const firstLetter = separatedSentence[i][0] || "";
    const word = firstLetter.toUpperCase() + separatedSentence[i].slice(1);
    separatedSentence[i] = configCapitalizations?.[word] || word;
  }
  const capitalizedString = separatedSentence.join(separator);
  if (!capitalizedString.includes(".")) {
    return capitalizedString;
  }
  const dotSentence = capitalizedString.split(".");
  for (let i = 0; i < dotSentence.length; i += 1) {
    const firstLetter = dotSentence[i][0] || "";
    const word = firstLetter.toUpperCase() + dotSentence[i].slice(1);
    dotSentence[i] = configCapitalizations?.[word] || word;
  }
  const capitalizedDotString = dotSentence.join(".");
  return capitalizedDotString;
};
