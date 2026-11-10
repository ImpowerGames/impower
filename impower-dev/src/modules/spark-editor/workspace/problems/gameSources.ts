import { GameChosePathToContinueMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameChosePathToContinueMessage";
import { GameStartedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameStartedMessage";
import { GameEncounteredRuntimeErrorMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameEncounteredRuntimeError";
import { GameToggledConsoleMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameToggledConsoleMessage";
import { playedFromChoice, playedFromRuntimeError } from "./problemEntries";
import type { PanelSource, PlayedSource, RunSource } from "./ProblemsStore";

export const runtimeErrorSource: PlayedSource = (message) =>
  GameEncounteredRuntimeErrorMessage.type.isNotification(message) &&
  message.params.state === "running"
    ? playedFromRuntimeError(message.params)
    : null;

export const choiceMadeSource: PlayedSource = (message) =>
  GameChosePathToContinueMessage.type.isNotification(message) &&
  message.params.checkpoint != null
    ? playedFromChoice({
        checkpoint: message.params.checkpoint,
        text: message.params.text,
      })
    : null;

export const runStartSource: RunSource = (message) =>
  GameStartedMessage.type.isNotification(message);

export const consoleToggleSource: PanelSource = (message) =>
  GameToggledConsoleMessage.type.isNotification(message)
    ? message.params.open
    : null;
