import React from "react";
import ConfigCache from "../classes/configCache";
import { ConfigContextState } from "../types/configContextState";
import { ConfigParameters } from "../types/interfaces/configParameters";

export const ConfigContext = React.createContext<ConfigContextState>([
  {
    abbreviations: undefined,
    capitalizations: undefined,
    colors: undefined,
    projectTags: undefined,
    moods: undefined,
    locations: undefined,
    atmospheres: undefined,
    catalysts: undefined,
    archetypes: undefined,
    phrases: undefined,
    messages: undefined,
    regexes: undefined,
    resourceTags: undefined,
    roleTags: undefined,
    tagColorNames: undefined,
    tagDisambiguations: undefined,
    tagIconNames: undefined,
    tagPatterns: undefined,
    terms: undefined,
  },
  async (): Promise<ConfigParameters> => ConfigCache.instance.params,
]);
