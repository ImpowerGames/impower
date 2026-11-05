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
import { SetPreviewThemeMessage } from "@impower/spark-editor-protocol/src/protocols/preview/SetPreviewThemeMessage";
import { SetStartingValuesMessage } from "@impower/spark-editor-protocol/src/protocols/preview/SetStartingValuesMessage";
import { effect, type ReadonlySignal } from "@preact/signals";
import { startingValuesFrom } from "@impower/sparkdown/src/program/startingValueLiterals";
import workspace from "../../workspace/WorkspaceStore";
import { WorkspaceConstants } from "../../workspace/WorkspaceConstants";
import workspaceSettings from "../../workspace/settings/WorkspaceSettings";

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

export const playerUrl = (
  base: string,
  theme: ReadonlySignal<string> = workspaceSettings.theme,
) => `${base}#theme=${theme.peek()}`;

export const createPlayerPreferenceSync = (
  post: (message: unknown) => void,
  routePins: () => RoutePin[] = () => [],
  theme: ReadonlySignal<string> = workspaceSettings.theme,
) => {
  const sendTheme = (value: string) =>
    post(SetPreviewThemeMessage.type.notification({ theme: value }));
  const send = () => {
    sendTheme(theme.peek());
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
  let current = theme.peek();
  const disposeTheme = effect(() => {
    const value = theme.value;
    if (value !== current) {
      current = value;
      sendTheme(value);
    }
  });
  return {
    dispose: () => disposeTheme(),
    initialized: send,
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
