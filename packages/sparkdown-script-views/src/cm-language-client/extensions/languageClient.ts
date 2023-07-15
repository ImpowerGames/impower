import { Language } from "@codemirror/language";
import { Extension, Facet, combineConfig } from "@codemirror/state";
import { ViewPlugin } from "@codemirror/view";
import { NodeType } from "@lezer/common";
import { Tag } from "@lezer/highlight";

import LanguageClientPluginValue from "../classes/LanguageClientPluginValue";
import LanguageServerConnection from "../classes/LanguageServerConnection";
import ColorSupport from "../classes/features/ColorSupport";
import CompletionSupport from "../classes/features/CompletionSupport";
import FoldingSupport from "../classes/features/FoldingSupport";

export interface LanguageClientConfig {
  connection: LanguageServerConnection;
  language: Language;
  highlighter: {
    style(tags: readonly Tag[]): string | null;
    scope?(node: NodeType): boolean;
  };
}

const defaultLanguageClientConfig = {};

export const languageClientConfig = Facet.define<
  LanguageClientConfig,
  Required<LanguageClientConfig>
>({
  combine(configs) {
    return combineConfig<Required<LanguageClientConfig>>(
      configs,
      defaultLanguageClientConfig
    );
  },
});

const languageClient = (config: LanguageClientConfig): Extension[] => {
  const folding = new FoldingSupport();
  const color = new ColorSupport();
  const completion = new CompletionSupport();
  return [
    languageClientConfig.of(config),
    ViewPlugin.define((view) => {
      const plugin = new LanguageClientPluginValue(view, {
        folding,
        color,
        completion,
      });
      return plugin;
    }),
    folding.load(),
    color.load(),
    completion.load(),
  ];
};

export default languageClient;
