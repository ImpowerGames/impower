import { type Range, type WorkspaceEdit } from "vscode-languageserver-protocol";
import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type ApplyEditorEditMethod = typeof ApplyEditorEditMessage.method;

export interface EditorFixChange {
  from: number;
  to: number;
  insert: string;
}

export interface EditorFix {
  uri: string;
  version?: number;
  range: Range;
  changes: EditorFixChange[];
  expect?: string;
  kind?: "name" | "note";
}

export interface EditorFixText {
  from: number;
  to: number;
  text: string;
}

export interface EditorFixRevert {
  changes: EditorFixChange[];
  inserted: EditorFixText[];
}

export interface EditorFixUndo {
  uri: string;
  fix?: number | string;
  revert: EditorFixRevert;
}

export interface ApplyEditorEditParams {
  label?: string;
  edit: WorkspaceEdit;
  closedTexts?: Record<string, string>;
  fix?: EditorFix;
  undoFix?: EditorFixUndo;
}

export interface ApplyEditorEditResult {
  applied: string[];
  refused?: string[];
  revert?: EditorFixRevert;
}

export class ApplyEditorEditMessage {
  static readonly method = "editor/applyEdit";
  static readonly type = new MessageProtocolRequestType<
    ApplyEditorEditMethod,
    ApplyEditorEditParams,
    ApplyEditorEditResult
  >(ApplyEditorEditMessage.method);
}

export namespace ApplyEditorEditMessage {
  export interface Request extends RequestMessage<
    ApplyEditorEditMethod,
    ApplyEditorEditParams,
    ApplyEditorEditResult
  > {}
  export type Response = ResponseMessage<
    ApplyEditorEditMethod,
    ApplyEditorEditResult
  >;
}
