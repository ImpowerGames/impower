import type { TextDocumentIdentifier } from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type EditorShortcutGroup = "editing" | "navigation" | "find" | "story";

export interface EditorKeybinding {
  id: string;
  label: string;
  group: EditorShortcutGroup;
  keys: string[];
}

export interface ReadEditorKeybindingsParams {
  textDocument?: TextDocumentIdentifier;
}

export interface ReadEditorKeybindingsResult {
  mac: boolean;
  commands: EditorKeybinding[];
}

export class ReadEditorKeybindingsMessage {
  static readonly method = "editor/readKeybindings";
  static readonly type = new MessageProtocolRequestType<
    typeof ReadEditorKeybindingsMessage.method,
    ReadEditorKeybindingsParams,
    ReadEditorKeybindingsResult
  >(ReadEditorKeybindingsMessage.method);
}
