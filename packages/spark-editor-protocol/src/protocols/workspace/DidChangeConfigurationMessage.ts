import { DidChangeConfigurationParams } from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidChangeConfigurationMethod =
  typeof DidChangeConfigurationMessage.method;

export namespace DidChangeConfigurationMessage {
  export const method = "workspace/didChangeConfiguration";
  export const type = new MessageProtocolNotificationType<
    DidChangeConfigurationMethod,
    DidChangeConfigurationParams
  >(DidChangeConfigurationMessage.method);
}
