import { DidChangeConfigurationParams } from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidChangeConfigurationMethod =
  typeof DidChangeConfigurationMessage.method;

export class DidChangeConfigurationMessage {
  static readonly method = "workspace/didChangeConfiguration";
  static readonly type = new MessageProtocolNotificationType<
    DidChangeConfigurationMethod,
    DidChangeConfigurationParams
  >(DidChangeConfigurationMessage.method);
}
