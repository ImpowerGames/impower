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

export interface WorkspaceEditAction {
  kind: "rename" | "put-back";
  targets: LSP.DocumentUri[];
}

export interface WorkspaceEditMetadata {
  isRefactoring?: boolean;
  action?: WorkspaceEditAction;
}

export type ApplyWorkspaceEditParams = LSP.ApplyWorkspaceEditParams & {
  edit: WorkspaceEdit;
  metadata?: WorkspaceEditMetadata;
  expectedTexts?: Record<string, string>;
  confirm?: boolean;
};

export interface WorkspaceEditRollback {
  complete: boolean;
  failed: LSP.DocumentUri[];
  kept: LSP.DocumentUri[];
  trashed?: LSP.DocumentUri[];
}

export type ApplyWorkspaceEditResult = LSP.ApplyWorkspaceEditResult & {
  rollback?: WorkspaceEditRollback;
};

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
  export type Response = ResponseMessage<
    ApplyWorkspaceEditMethod,
    ApplyWorkspaceEditResult
  >;
}
