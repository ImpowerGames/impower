import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import type { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import type { AssetItem } from "@impower/spark-engine/src/game/modules/assets/types/AssetItem";

export type PreviewHintMethod = typeof PreviewHintMessage.method;

export interface PreviewHintParams {
  cursor: AssetItem[];
  near: AssetItem[];
  rest: AssetItem[] | null;
}

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
