import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type ConfirmWorkspaceEditMethod =
  typeof ConfirmWorkspaceEditMessage.method;

export interface ConfirmWorkspaceEditParams {
  edit: number | string;
}

export interface ConfirmWorkspaceEditResult {
  refusal?: string;
}

export class ConfirmWorkspaceEditMessage {
  static readonly method = "workspace/confirmWorkspaceEdit";
  static readonly type = new MessageProtocolRequestType<
    ConfirmWorkspaceEditMethod,
    ConfirmWorkspaceEditParams,
    ConfirmWorkspaceEditResult
  >(ConfirmWorkspaceEditMessage.method);
}
