import {
  ApplyWorkspaceEditParams,
  ApplyWorkspaceEditResult,
} from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type ApplyWorkspaceEditMethod = typeof ApplyWorkspaceEditMessage.method;

export class ApplyWorkspaceEditMessage {
  static readonly method = "workspace/applyWorkspaceEdit";
  static readonly type = new MessageProtocolRequestType<
    ApplyWorkspaceEditMethod,
    ApplyWorkspaceEditParams,
    ApplyWorkspaceEditResult
  >(ApplyWorkspaceEditMessage.method);
}
