import { ConfigurationParams, LSPAny } from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type ConfigurationMethod = typeof ConfigurationMessage.method;

export class ConfigurationMessage {
  static readonly method = "workspace/configuration";
  static readonly type = new MessageProtocolRequestType<
    ConfigurationMethod,
    ConfigurationParams,
    LSPAny[]
  >(ConfigurationMessage.method);
}
