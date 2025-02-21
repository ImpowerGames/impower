import { ExecuteCommandParams } from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type ExecuteCommandMethod = typeof ExecuteCommandMessage.method;

export class ExecuteCommandMessage {
  static readonly method = "workspace/executeCommand";
  static readonly type = new MessageProtocolRequestType<
    ExecuteCommandMethod,
    ExecuteCommandParams,
    any
  >(ExecuteCommandMessage.method);
}
