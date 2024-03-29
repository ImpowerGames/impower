import {
  cert,
  getApp,
  initializeApp,
  ServiceAccount,
} from "firebase-admin/app";
import { getRemoteConfig } from "firebase-admin/remote-config";
import fs from "fs";

export const publishRemoteConfig = async (credentials: ServiceAccount) => {
  const app =
    getApp() ||
    initializeApp({
      credential: cert(credentials),
    });
  const config = getRemoteConfig(app);
  const template = await config.getTemplate();
  const phrasesPath = "../../../concept-generator/src/input/phrases.txt";
  const phrases = JSON.stringify(
    fs.readFileSync(phrasesPath, "utf8").split(/\r?\n/)
  );
  const archetypesPath = "../../../concept-generator/src/input/archetypes.txt";
  const archetypes = JSON.stringify(
    fs.readFileSync(archetypesPath, "utf8").split(/\r?\n/)
  );
  const termsPath = "../../../concept-generator/src/output/terms.json";
  const terms = fs.readFileSync(termsPath, "utf8");
  const colors = JSON.stringify(
    (await import("../../../client/resources/json/colors.json")).default
  );
  const abbreviations = JSON.stringify(
    (await import("../../../client/resources/json/en/abbreviations.json"))
      .default
  );
  const capitalizations = JSON.stringify(
    (await import("../../../client/resources/json/en/capitalizations.json"))
      .default
  );
  const projectTags = JSON.stringify(
    (await import("../../../client/resources/json/en/projectTags.json")).default
  );
  const messages = JSON.stringify(
    (await import("../../../client/resources/json/en/messages.json")).default
  );
  const atmospheres = JSON.stringify(
    (await import("../../../client/resources/json/en/atmospheres.json")).default
  );
  const locations = JSON.stringify(
    (await import("../../../client/resources/json/en/locations.json")).default
  );
  const catalysts = JSON.stringify(
    (await import("../../../client/resources/json/en/catalysts.json")).default
  );
  const moods = JSON.stringify(
    (await import("../../../client/resources/json/en/moods.json")).default
  );
  const regexes = JSON.stringify(
    (await import("../../../client/resources/json/en/regexes.json")).default
  );
  const visualStyles = JSON.stringify(
    (await import("../../../client/resources/json/en/visualStyles.json"))
      .default
  );
  const musicalStyles = JSON.stringify(
    (await import("../../../client/resources/json/en/musicalStyles.json"))
      .default
  );
  const resourceTags = JSON.stringify(
    (await import("../../../client/resources/json/en/resourceTags.json"))
      .default
  );
  const roleTags = JSON.stringify(
    (await import("../../../client/resources/json/en/roleTags.json")).default
  );
  const tagDisambiguations = JSON.stringify(
    (await import("../../../client/resources/json/en/tagDisambiguations.json"))
      .default
  );
  const tagColorNames = JSON.stringify(
    (await import("../../../client/resources/json/tagColorNames.json")).default
  );
  const tagIconNames = JSON.stringify(
    (await import("../../../client/resources/json/tagIconNames.json")).default
  );
  const tagPatterns = JSON.stringify(
    (await import("../../../client/resources/json/tagPatterns.json")).default
  );
  template.parameters["phrases"] = {
    defaultValue: { value: phrases },
  };
  template.parameters["archetypes"] = {
    defaultValue: { value: archetypes },
  };
  template.parameters["terms"] = {
    defaultValue: { value: terms },
  };
  template.parameters["colors"] = {
    defaultValue: { value: colors },
  };
  template.parameters["abbreviations"] = {
    defaultValue: { value: abbreviations },
  };
  template.parameters["capitalizations"] = {
    defaultValue: { value: capitalizations },
  };
  template.parameters["projectTags"] = {
    defaultValue: { value: projectTags },
  };
  template.parameters["messages"] = {
    defaultValue: { value: messages },
  };
  template.parameters["atmospheres"] = {
    defaultValue: { value: atmospheres },
  };
  template.parameters["locations"] = {
    defaultValue: { value: locations },
  };
  template.parameters["catalysts"] = {
    defaultValue: { value: catalysts },
  };
  template.parameters["moods"] = {
    defaultValue: { value: moods },
  };
  template.parameters["regexes"] = {
    defaultValue: { value: regexes },
  };
  template.parameters["visualStyles"] = {
    defaultValue: { value: visualStyles },
  };
  template.parameters["musicalStyles"] = {
    defaultValue: { value: musicalStyles },
  };
  template.parameters["resourceTags"] = {
    defaultValue: { value: resourceTags },
  };
  template.parameters["roleTags"] = {
    defaultValue: { value: roleTags },
  };
  template.parameters["tagDisambiguations"] = {
    defaultValue: { value: tagDisambiguations },
  };
  template.parameters["tagColorNames"] = {
    defaultValue: { value: tagColorNames },
  };
  template.parameters["tagIconNames"] = {
    defaultValue: { value: tagIconNames },
  };
  template.parameters["tagPatterns"] = {
    defaultValue: { value: tagPatterns },
  };
  await config.validateTemplate(template);
  await config.publishTemplate(template);
};
