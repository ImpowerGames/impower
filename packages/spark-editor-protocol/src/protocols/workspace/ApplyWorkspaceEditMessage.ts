import {
  ApplyWorkspaceEditParams,
  ApplyWorkspaceEditResult,
} from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type ApplyWorkspaceEditMethod = typeof ApplyWorkspaceEditMessage.method;

export namespace ApplyWorkspaceEditMessage {
  export const method = "workspace/applyWorkspaceEdit";
  export const type = new MessageProtocolRequestType<
    ApplyWorkspaceEditMethod,
    ApplyWorkspaceEditParams,
    ApplyWorkspaceEditResult
  >(ApplyWorkspaceEditMessage.method);
}
