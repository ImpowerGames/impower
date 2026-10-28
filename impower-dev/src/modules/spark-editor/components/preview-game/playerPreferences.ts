import { ConnectedPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/ConnectedPreviewMessage";
import { DidChangeRouteTogglesMessage } from "@impower/spark-editor-protocol/src/protocols/preview/DidChangeRouteTogglesMessage";
import {
  SetRouteTogglesMessage,
  type RouteTogglesParams,
} from "@impower/spark-editor-protocol/src/protocols/preview/SetRouteTogglesMessage";
import { SetAnimatePortraitsMessage } from "@impower/spark-engine/src/game/core/classes/messages/SetAnimatePortraitsMessage";
import workspace from "../../workspace/WorkspaceStore";
import { WorkspaceConstants } from "../../workspace/WorkspaceConstants";

/** The route list's toggles as this browser keeps them for the author, in
 *  every project. */
const storedRouteToggles = (): RouteTogglesParams => {
  try {
    const stored = JSON.parse(
      localStorage.getItem(WorkspaceConstants.ROUTE_TOGGLES_STORAGE_KEY) ??
        "{}",
    );
    return stored && typeof stored === "object" ? stored : {};
  } catch {
    return {};
  }
};

/**
 * Keeps a game player in step with the editor's player preferences: whether
 * portraits animate, and which kinds the route list shows, which the player
 * reports when the author changes them. A new player starts with portraits
 * animating and every kind shown, and its controller handles nothing until it
 * announces itself with `preview/connected`, which can come before or after
 * Initialize completes; it hears the preferences at both.
 */
export const createPlayerPreferenceSync = (post: (message: unknown) => void) => {
  const send = () => {
    post(
      SetAnimatePortraitsMessage.type.request({
        enabled: workspace.animatePortraits.peek(),
      }),
    );
    post(
      SetRouteTogglesMessage.type.request({ toggles: storedRouteToggles() }),
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
      if (DidChangeRouteTogglesMessage.type.isNotification(message)) {
        localStorage.setItem(
          WorkspaceConstants.ROUTE_TOGGLES_STORAGE_KEY,
          JSON.stringify(message.params.toggles),
        );
      }
    },
  };
};
