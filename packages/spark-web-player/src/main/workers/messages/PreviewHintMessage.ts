import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import type { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import type { AssetItem } from "@impower/spark-engine/src/game/modules/assets/types/AssetItem";

export type PreviewHintMethod = typeof PreviewHintMessage.method;

/** A `PreviewHintPlan` without the state the worker keeps. */
export interface PreviewHintParams {
  cursor: AssetItem[];
  near: AssetItem[];
  rest: AssetItem[] | null;
}

/**
 * The scene warm-up for a selection, sent by the player's worker when it
 * holds the program (`workerDisplaysPreview`), as soon as the selection
 * arrives and before the route to it is planned. The page applies it to its
 * asset cache as it applies a hint it planned itself (`applyPreviewHint`):
 * the cursor's beats in the express lane, the window and the rest of the
 * scene at their priorities. Its own method, because the engine's
 * `assets/prefetch` travels in the game's stream and carries one tier.
 */
export class PreviewHintMessage {
  static readonly method = "player/previewHint";
  static readonly type = new MessageProtocolNotificationType<
    PreviewHintMethod,
    PreviewHintParams
  >(PreviewHintMessage.method);
}

export namespace PreviewHintMessage {
  export interface Notification extends NotificationMessage<
    PreviewHintMethod,
    PreviewHintParams
  > {}
}
