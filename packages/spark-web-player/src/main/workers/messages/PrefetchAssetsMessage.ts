import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import type { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import type { AssetItem } from "@impower/spark-engine/src/game/modules/assets/types/AssetItem";

export type PrefetchAssetsMethod = typeof PrefetchAssetsMessage.method;

/** A `PreviewHintPlan` without the state the worker keeps. */
export interface PrefetchAssetsParams {
  cursor: AssetItem[];
  near: AssetItem[];
  rest: AssetItem[] | null;
}

/**
 * The scene warm-up for a selection, sent by the player's worker when it
 * holds the program (`workerDisplaysPreview`), as soon as the selection
 * arrives and before the route to it is planned. The page applies it to its
 * asset cache as it applies a hint it planned itself (`applyPreviewHint`).
 */
export class PrefetchAssetsMessage {
  static readonly method = "assets/prefetch";
  static readonly type = new MessageProtocolNotificationType<
    PrefetchAssetsMethod,
    PrefetchAssetsParams
  >(PrefetchAssetsMessage.method);
}

export namespace PrefetchAssetsMessage {
  export interface Notification extends NotificationMessage<
    PrefetchAssetsMethod,
    PrefetchAssetsParams
  > {}
}
