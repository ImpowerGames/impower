import type { Position, Range, TextDocumentIdentifier } from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export interface ReadEditorParams {
  textDocument?: TextDocumentIdentifier;
  position?: Position;
}
export interface ReadEditorResult {
  textDocument: { uri: string; version: number; text: string };
  selection: Range;
  coordinates: { left: number; right: number; top: number; bottom: number } | null;
}
/** Read the active script's model and optional measured position. */
export class ReadEditorMessage {
  static readonly method = "editor/read";
  static readonly type = new MessageProtocolRequestType<
    typeof ReadEditorMessage.method, ReadEditorParams, ReadEditorResult
  >(ReadEditorMessage.method);
}
