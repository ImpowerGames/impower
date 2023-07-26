import { Language } from "@codemirror/language";
import { Extension, Facet, combineConfig } from "@codemirror/state";
import { ViewPlugin } from "@codemirror/view";
import { NodeType } from "@lezer/common";
import { Tag } from "@lezer/highlight";

import {
  MessageConnection,
  ServerCapabilities,
} from "vscode-languageserver-protocol";
import LanguageClientPluginValue from "../classes/LanguageClientPluginValue";
import ColorSupport from "../classes/features/ColorSupport";
import CompletionSupport from "../classes/features/CompletionSupport";
import FoldingSupport from "../classes/features/FoldingSupport";
import HoverSupport from "../classes/features/HoverSupport";
import { FileSystemReader } from "../types/FileSystemReader";

export interface LanguageClientConfig {
  textDocument: { uri: string; version: number };
  connection: MessageConnection;
  serverCapabilities: ServerCapabilities;
  fileSystemReader?: FileSystemReader;
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
  const hover = new HoverSupport();
  return [
    languageClientConfig.of(config),
    ViewPlugin.define((view) => {
      const plugin = new LanguageClientPluginValue(view, {
        folding,
        color,
        completion,
        hover,
      });
      return plugin;
    }),
    folding.load(),
    color.load(),
    completion.load(),
    hover.load(),
  ];
};

export default languageClient;
