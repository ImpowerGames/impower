import capitalizations from "../../../resources/json/en/capitalizations.json";
import ConfigCache from "../classes/configCache";

export const capitalize = (name: string, separator = " "): string => {
  const configCapitalizations =
    ConfigCache.instance.params?.capitalizations || capitalizations;

  if (!name || typeof name !== "string") {
    return name;
  }
  const sentence = name.split(separator);
  for (let i = 0; i < sentence.length; i += 1) {
    const firstLetter = sentence[i][0] || "";
    const word = firstLetter.toUpperCase() + sentence[i].slice(1);
    sentence[i] = configCapitalizations?.[word] || word;
  }
  return sentence.join(" ");
};
