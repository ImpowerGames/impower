import { type WorkspaceEdit } from "vscode-languageserver-protocol";
import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type ApplyEditorEditMethod = typeof ApplyEditorEditMessage.method;

export interface ApplyEditorEditParams {
  label?: string;
  edit: WorkspaceEdit;
  closedTexts?: Record<string, string>;
}

export interface ApplyEditorEditResult {
  applied: string[];
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
