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
import { GameStartedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameStartedMessage";
import {
  SetSimulatedColorSchemeMessage,
  type ColorScheme,
} from "@impower/spark-engine/src/game/core/classes/messages/SetSimulatedColorSchemeMessage";
import {
  SetStartingDisplayModeMessage,
  type StartingDisplayMode,
} from "@impower/spark-engine/src/game/core/classes/messages/SetStartingDisplayModeMessage";
import { SetAutoPlayBeatsMessage } from "@impower/spark-editor-protocol/src/protocols/preview/SetAutoPlayBeatsMessage";
import { SetPreviewThemeMessage } from "@impower/spark-editor-protocol/src/protocols/preview/SetPreviewThemeMessage";
import { SetStartingValuesMessage } from "@impower/spark-editor-protocol/src/protocols/preview/SetStartingValuesMessage";
import { effect, type ReadonlySignal } from "@preact/signals";
import { startingValuesFrom } from "@impower/sparkdown/src/program/startingValueLiterals";
import workspace from "../../workspace/WorkspaceStore";
import { WorkspaceConstants } from "../../workspace/WorkspaceConstants";
import workspaceSettings from "../../workspace/settings/WorkspaceSettings";
import {
  simulatedColorSchemeOf,
  startingDisplayModeOf,
  type Preferences,
  type PreviewMotion,
  type ProjectSettings,
} from "../../workspace/settings/settingsSchema";
import { DisableGameDebugMessage } from "@impower/spark-engine/src/game/core/classes/messages/DisableGameDebugMessage";
import { EnableGameDebugMessage } from "@impower/spark-engine/src/game/core/classes/messages/EnableGameDebugMessage";

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
) => `${base}#theme=${theme.peek()}&backdrop=game`;

export const createPlayerPreferenceSync = (
  post: (message: unknown) => void,
  routePins: () => RoutePin[] = () => [],
  theme: ReadonlySignal<string> = workspaceSettings.theme,
  preferences: ReadonlySignal<Preferences> = workspaceSettings.preferences,
  projectSettings: ReadonlySignal<ProjectSettings> = workspaceSettings.projectSettings,
  motion: ReadonlySignal<PreviewMotion> = workspaceSettings.previewMotion,
) => {
  const sendTheme = (value: string) =>
    post(SetPreviewThemeMessage.type.notification({ theme: value }));
  const sendIdleAnimations = (enabled: boolean) =>
    post(SetAnimatePortraitsMessage.type.request({ enabled }));
  const autoPlayBeatsOf = () =>
    motion.peek().autoPlayBeats && preferences.peek().previewFollowsCursor;
  const sendAutoPlayBeats = (enabled: boolean) =>
    post(SetAutoPlayBeatsMessage.type.request({ enabled }));
  const sendTypingPauses = (enabled: boolean) =>
    post(
      enabled
        ? EnableGameDebugMessage.type.request({})
        : DisableGameDebugMessage.type.request({}),
    );
  const sendDisplayMode = (mode: StartingDisplayMode) =>
    post(SetStartingDisplayModeMessage.type.request({ mode }));
  const currentColorScheme = () =>
    simulatedColorSchemeOf(
      projectSettings.peek().previewColorScheme,
      theme.peek(),
    );
  const sendColorScheme = (scheme: ColorScheme) =>
    post(SetSimulatedColorSchemeMessage.type.request({ color_scheme: scheme }));
  const send = () => {
    sendTheme(theme.peek());
    sendIdleAnimations(motion.peek().idleAnimations);
    sendAutoPlayBeats(autoPlayBeatsOf());
    sendTypingPauses(preferences.peek().previewTypingPauses);
    sendDisplayMode(startingDisplayModeOf(preferences.peek().previewMode));
    sendColorScheme(currentColorScheme());
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
  let idleAnimations = motion.peek().idleAnimations;
  let autoPlayBeats = autoPlayBeatsOf();
  let typingPauses = preferences.peek().previewTypingPauses;
  let displayMode = startingDisplayModeOf(preferences.peek().previewMode);
  const disposePreferences = effect(() => {
    const value = preferences.value;
    const nextMotion = motion.value;
    const nextDisplayMode = startingDisplayModeOf(value.previewMode);
    if (nextDisplayMode !== displayMode) {
      displayMode = nextDisplayMode;
      sendDisplayMode(displayMode);
    }
    if (nextMotion.idleAnimations !== idleAnimations) {
      idleAnimations = nextMotion.idleAnimations;
      sendIdleAnimations(idleAnimations);
    }
    const nextAutoPlayBeats =
      nextMotion.autoPlayBeats && value.previewFollowsCursor;
    if (nextAutoPlayBeats !== autoPlayBeats) {
      autoPlayBeats = nextAutoPlayBeats;
      sendAutoPlayBeats(autoPlayBeats);
    }
    if (value.previewTypingPauses !== typingPauses) {
      typingPauses = value.previewTypingPauses;
      sendTypingPauses(typingPauses);
    }
  });
  let colorScheme = currentColorScheme();
  const disposeColorScheme = effect(() => {
    const next = simulatedColorSchemeOf(
      projectSettings.value.previewColorScheme,
      theme.value,
    );
    if (next !== colorScheme) {
      colorScheme = next;
      sendColorScheme(colorScheme);
    }
  });
  return {
    dispose: () => {
      disposeTheme();
      disposePreferences();
      disposeColorScheme();
    },
    initialized: send,
    received: (message: unknown) => {
      if (
        ConnectedPreviewMessage.type.isNotification(message) &&
        message.params.type === "game"
      ) {
        send();
      }
      if (GameStartedMessage.type.isNotification(message)) {
        sendColorScheme(currentColorScheme());
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
