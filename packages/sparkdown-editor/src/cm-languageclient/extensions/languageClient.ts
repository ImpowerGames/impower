import { Extension, Facet, combineConfig } from "@codemirror/state";
import { ViewPlugin } from "@codemirror/view";

import LanguageClientPluginValue from "../classes/LanguageClientPluginValue";
import LanguageServerConnection from "../classes/LanguageServerConnection";

export interface LanguageClientConfig {
  connection: LanguageServerConnection;
  documentUri: string;
  throttleDelay?: number;
}

export const languageClientConfig = Facet.define<
  LanguageClientConfig,
  Required<LanguageClientConfig>
>({
  combine(configs) {
    return combineConfig<Required<LanguageClientConfig>>(configs, {
      throttleDelay: 500,
    });
  },
});

const languageClient = (config: LanguageClientConfig): Extension[] => {
  return [
    ViewPlugin.fromClass(LanguageClientPluginValue),
    languageClientConfig.of(config),
  ];
};

export default languageClient;
