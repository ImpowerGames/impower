import { EditorView, ViewPlugin } from "@codemirror/view";
import ColorViewPlugin from "../classes/ColorViewPlugin";
import LanguageClient from "../classes/LanguageClient";
import LanguageClientPlugin from "../classes/LanguageClientPlugin";

const languageClientExtension = (
  client: LanguageClient,
  documentUri: string
) => {
  let plugin: LanguageClientPlugin | null = null;
  return [
    ViewPlugin.define((view: EditorView) => {
      plugin = new LanguageClientPlugin(view, client, documentUri);
      return plugin;
    }),
    ViewPlugin.fromClass(ColorViewPlugin, {
      decorations: (v) => v.decorations,
    }),
  ];
};

export default languageClientExtension;
