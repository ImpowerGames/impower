import type * as LSP from "../../types";
import { LSPAny } from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type ConfigurationMethod = typeof ConfigurationMessage.method;

export type ConfigurationParams = LSP.ConfigurationParams;

export class ConfigurationMessage {
  static readonly method = "workspace/configuration";
  static readonly type = new MessageProtocolRequestType<
    ConfigurationMethod,
    ConfigurationParams,
    LSPAny[]
  >(ConfigurationMessage.method);
}
