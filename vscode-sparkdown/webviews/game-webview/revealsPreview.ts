import { DidChangeGameStateMessage } from "@impower/spark-editor-protocol/src/protocols/preview/GameStateMessage";
import { GamePreviewedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GamePreviewedMessage";

/**
 * Whether a message from the player means the panel has something to show,
 * so the webview can stop hiding it.
 *
 * The game says so when it has displayed a beat. The player also says so when
 * a preview update has finished, which covers a point that displays no beat:
 * a line that resolves to no beat previews nothing, and waiting for a beat
 * there left the panel black for good (#1874).
 */
export const revealsPreview = (message: unknown): boolean =>
  GamePreviewedMessage.type.isNotification(message) ||
  (DidChangeGameStateMessage.type.isNotification(message) &&
    message.params.position != null);
