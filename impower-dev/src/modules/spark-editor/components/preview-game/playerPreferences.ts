import { ConnectedPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/ConnectedPreviewMessage";
import { SetAnimatePortraitsMessage } from "@impower/spark-engine/src/game/core/classes/messages/SetAnimatePortraitsMessage";
import workspace from "../../workspace/WorkspaceStore";

/**
 * Keeps a game player in step with the editor's player preferences. A new
 * player starts with portraits animating, and its controller handles nothing
 * until it announces itself with `preview/connected`, which can come before
 * or after Initialize completes; it hears the preferences at both.
 */
export const createPlayerPreferenceSync = (post: (message: unknown) => void) => {
  const send = () => {
    post(
      SetAnimatePortraitsMessage.type.request({
        enabled: workspace.animatePortraits.peek(),
      }),
    );
  };
  return {
    /** The player finished Initialize. */
    initialized: send,
    /** A message arrived from the player. */
    received: (message: unknown) => {
      if (
        ConnectedPreviewMessage.type.isNotification(message) &&
        message.params.type === "game"
      ) {
        send();
      }
    },
  };
};
