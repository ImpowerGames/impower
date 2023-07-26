import { DidChangeConfigurationParams } from "vscode-languageserver-protocol";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidChangeConfigurationMethod = typeof DidChangeConfiguration.method;

export abstract class DidChangeConfiguration {
  static readonly method = "workspace/didChangeConfiguration";
  static readonly type = new MessageProtocolNotificationType<
    DidChangeConfigurationMethod,
    DidChangeConfigurationParams
  >(DidChangeConfiguration.method);
}
