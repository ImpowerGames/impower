import type * as LSP from "../../types";
import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type ApplyWorkspaceEditMethod = typeof ApplyWorkspaceEditMessage.method;

export interface WorkspaceEdit extends LSP.WorkspaceEdit {
  documentChanges?: (
    | LSP.TextDocumentEdit
    | (LSP.CreateFile & { data?: ArrayBuffer })
    | LSP.RenameFile
    | LSP.DeleteFile
  )[];
}

export type ApplyWorkspaceEditParams = LSP.ApplyWorkspaceEditParams & {
  edit: WorkspaceEdit;
  metadata?: { isRefactoring?: boolean };
};

export type ApplyWorkspaceEditResult = LSP.ApplyWorkspaceEditResult;

export class ApplyWorkspaceEditMessage {
  static readonly method = "workspace/applyWorkspaceEdit";
  static readonly type = new MessageProtocolRequestType<
    ApplyWorkspaceEditMethod,
    ApplyWorkspaceEditParams,
    ApplyWorkspaceEditResult
  >(ApplyWorkspaceEditMessage.method);
}

export namespace ApplyWorkspaceEditMessage {
  export interface Request extends RequestMessage<
    ApplyWorkspaceEditMethod,
    ApplyWorkspaceEditParams,
    ApplyWorkspaceEditResult
  > {}
  export interface Response extends ResponseMessage<
    ApplyWorkspaceEditMethod,
    ApplyWorkspaceEditResult
  > {}
}
