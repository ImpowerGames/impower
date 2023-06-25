import { Extension } from "@codemirror/state";
import { EditorView, ViewPlugin } from "@codemirror/view";
import LanguageClientPlugin from "../classes/LanguageClientPlugin";
import LanguageServerConnection from "../classes/LanguageServerConnection";

const languageClient = (
  client: LanguageServerConnection,
  documentUri: string
): Extension[] => {
  return [
    ViewPlugin.define(
      (view: EditorView) => new LanguageClientPlugin(view, client, documentUri)
    ),
  ];
};

export default languageClient;
