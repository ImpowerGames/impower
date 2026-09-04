import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import { type PrefetchAssetsParams } from "../../types/PrefetchAssetsParams";

export type PrefetchAssetsMethod = typeof PrefetchAssetsMessage.method;

/** Load these items in the background; nothing waits on them. */
export class PrefetchAssetsMessage {
  static readonly method = "assets/prefetch";
  static readonly type = new MessageProtocolNotificationType<
    PrefetchAssetsMethod,
    PrefetchAssetsParams
  >(PrefetchAssetsMessage.method);
}

export interface PrefetchAssetsMessageMap extends Record<string, [any]> {
  [PrefetchAssetsMessage.method]: [
    ReturnType<typeof PrefetchAssetsMessage.type.notification>,
  ];
}
