import { GameEncounteredRuntimeErrorMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameEncounteredRuntimeError";
import { GameToggledConsoleMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameToggledConsoleMessage";
import { playedFromRuntimeError } from "./problemEntries";
import type { PanelSource, PlayedSource } from "./ProblemsStore";

export const runtimeErrorSource: PlayedSource = (message) =>
  GameEncounteredRuntimeErrorMessage.type.isNotification(message) &&
  message.params.state === "running"
    ? playedFromRuntimeError(message.params)
    : null;

export const consoleToggleSource: PanelSource = (message) =>
  GameToggledConsoleMessage.type.isNotification(message)
    ? message.params.open
    : null;
