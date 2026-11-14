import { TextDocumentIdentifier } from "../../types";
import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type ExecuteEditorCommandMethod =
  typeof ExecuteEditorCommandMessage.method;

export const EDITOR_COMMANDS = [
  "focus",
  "indent",
  "dedent",
  "format",
  "gotoLine",
  "search",
  "undo",
  "redo",
  "selectAll",
  "selectLine",
  "moveLineUp",
  "moveLineDown",
  "duplicateLine",
  "toggleComment",
  "rename",
  "references",
  "definition",
  "problems",
] as const;

export type EditorCommand = (typeof EDITOR_COMMANDS)[number];

export interface ExecuteEditorCommandParams {
  textDocument: TextDocumentIdentifier;
  command: EditorCommand;
}

export interface ExecuteEditorCommandResult {
  ran: boolean;
}

export class ExecuteEditorCommandMessage {
  static readonly method = "editor/executeCommand";
  static readonly type = new MessageProtocolRequestType<
    ExecuteEditorCommandMethod,
    ExecuteEditorCommandParams,
    ExecuteEditorCommandResult
  >(ExecuteEditorCommandMessage.method);
}

export namespace ExecuteEditorCommandMessage {
  export interface Request extends RequestMessage<
    ExecuteEditorCommandMethod,
    ExecuteEditorCommandParams,
    ExecuteEditorCommandResult
  > {}
  export type Response = ResponseMessage<
    ExecuteEditorCommandMethod,
    ExecuteEditorCommandResult
  >;
}
