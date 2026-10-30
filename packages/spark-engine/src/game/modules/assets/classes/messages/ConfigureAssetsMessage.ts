import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import { type ConfigureAssetsParams } from "../../types/ConfigureAssetsParams";

export type ConfigureAssetsMethod = typeof ConfigureAssetsMessage.method;

export class ConfigureAssetsMessage {
  static readonly method = "assets/configure";
  static readonly type = new MessageProtocolNotificationType<
    ConfigureAssetsMethod,
    ConfigureAssetsParams
  >(ConfigureAssetsMessage.method);
}

export interface ConfigureAssetsMessageMap extends Record<string, [any]> {
  [ConfigureAssetsMessage.method]: [
    ReturnType<typeof ConfigureAssetsMessage.type.notification>,
  ];
}
