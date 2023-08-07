import { EditorState } from "@codemirror/state";
import { ServerCapabilities } from "../../../../spark-editor-protocol/src/types";

export const getClientCompletionValidFor = (
  serverCapabilities: ServerCapabilities<any> | undefined
):
  | RegExp
  | ((text: string, from: number, to: number, state: EditorState) => boolean)
  | undefined => {
  const triggerCharacters =
    serverCapabilities?.completionProvider?.triggerCharacters;
  if (triggerCharacters) {
    return (text: string, _from: number, _to: number, _state: EditorState) => {
      const char = text[text.length - 1];
      return !char || !triggerCharacters.includes(char);
    };
  }
  return undefined;
};
