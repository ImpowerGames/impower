import { DidChangeGameStateMessage } from "@impower/spark-editor-protocol/src/protocols/preview/GameStateMessage";
import { GamePreviewedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GamePreviewedMessage";

export const revealsPreview = (message: unknown): boolean =>
  GamePreviewedMessage.type.isNotification(message) ||
  (DidChangeGameStateMessage.type.isNotification(message) &&
    message.params.position != null);
