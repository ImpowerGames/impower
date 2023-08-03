import { ConfigurationParams, LSPAny } from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type ConfigurationMethod = typeof ConfigurationMessage.method;

export namespace ConfigurationMessage {
  export const method = "workspace/configuration";
  export const type = new MessageProtocolRequestType<
    ConfigurationMethod,
    ConfigurationParams,
    LSPAny[]
  >(ConfigurationMessage.method);
}
