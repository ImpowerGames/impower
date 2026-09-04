import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import { type ReleaseAssetsParams } from "../../types/ReleaseAssetsParams";

export type ReleaseAssetsMethod = typeof ReleaseAssetsMessage.method;

/** Let go of pins, optionally evicting what they leave unpinned. */
export class ReleaseAssetsMessage {
  static readonly method = "assets/release";
  static readonly type = new MessageProtocolNotificationType<
    ReleaseAssetsMethod,
    ReleaseAssetsParams
  >(ReleaseAssetsMessage.method);
}

export interface ReleaseAssetsMessageMap extends Record<string, [any]> {
  [ReleaseAssetsMessage.method]: [
    ReturnType<typeof ReleaseAssetsMessage.type.notification>,
  ];
}
