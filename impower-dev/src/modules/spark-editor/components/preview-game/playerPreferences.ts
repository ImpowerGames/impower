import { ConnectedPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/ConnectedPreviewMessage";
import { DidChangeRouteTogglesMessage } from "@impower/spark-editor-protocol/src/protocols/preview/DidChangeRouteTogglesMessage";
import {
  SetRouteTogglesMessage,
  type RouteTogglesParams,
} from "@impower/spark-editor-protocol/src/protocols/preview/SetRouteTogglesMessage";
import {
  SetRoutePinsMessage,
  type RoutePin,
} from "@impower/spark-editor-protocol/src/protocols/preview/SetRoutePinsMessage";
import { SetAnimatePortraitsMessage } from "@impower/spark-engine/src/game/core/classes/messages/SetAnimatePortraitsMessage";
import { SetStartingValuesMessage } from "@impower/spark-editor-protocol/src/protocols/preview/SetStartingValuesMessage";
import { startingValuesFrom } from "@impower/sparkdown/src/program/startingValueLiterals";
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

const storedRouteTab = (): "route" | "values" | undefined => {
  const tab = localStorage.getItem(WorkspaceConstants.ROUTE_TAB_STORAGE_KEY);
  return tab === "route" || tab === "values" ? tab : undefined;
};

export const createPlayerPreferenceSync = (
  post: (message: unknown) => void,
  routePins: () => RoutePin[] = () => [],
) => {
  const send = () => {
    post(
      SetAnimatePortraitsMessage.type.request({
        enabled: workspace.animatePortraits.peek(),
      }),
    );
    post(
      SetRouteTogglesMessage.type.request({
        toggles: storedRouteToggles(),
        tab: storedRouteTab(),
      }),
    );
    post(
      SetStartingValuesMessage.type.request({
        values: startingValuesFrom(workspace.current.debug?.startingValues),
      }),
    );
    post(SetRoutePinsMessage.type.request({ pins: routePins() }));
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
        if (message.params.tab) {
          localStorage.setItem(
            WorkspaceConstants.ROUTE_TAB_STORAGE_KEY,
            message.params.tab,
          );
        }
      }
    },
  };
};
