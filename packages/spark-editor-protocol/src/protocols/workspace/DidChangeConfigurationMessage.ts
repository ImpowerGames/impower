import { DidChangeConfigurationParams } from "vscode-languageserver-protocol";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidChangeConfigurationMethod =
  typeof DidChangeConfigurationMessage.method;

export abstract class DidChangeConfigurationMessage {
  static readonly method = "workspace/didChangeConfiguration";
  static readonly type = new MessageProtocolNotificationType<
    DidChangeConfigurationMethod,
    DidChangeConfigurationParams
  >(DidChangeConfigurationMessage.method);
}
