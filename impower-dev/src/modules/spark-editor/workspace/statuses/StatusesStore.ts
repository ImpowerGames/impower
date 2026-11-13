import {
  DidChangeGameStateMessage,
  type GameStatuses,
} from "@impower/spark-editor-protocol/src/protocols/preview/GameStateMessage";
import { signal } from "@preact/signals";
import type { PreviewMode } from "../settings/settingsSchema";

export const NO_GAME_STATUSES: GameStatuses = { completion: null, ending: null };

export const GAME_STARTING_STATUS = "Starting the game…";

export interface ShownStatus {
  key: "starting" | "completion" | "ending";
  text: string;
  tone: "default" | "error";
}

export const shownStatuses = (
  statuses: GameStatuses,
  mode: PreviewMode,
  starting = false,
): ShownStatus[] => {
  const shown: ShownStatus[] = [];
  if (starting) {
    shown.push({ key: "starting", text: GAME_STARTING_STATUS, tone: "default" });
  }
  if (statuses.completion) {
    shown.push({
      key: "completion",
      text: statuses.completion.text,
      tone: "default",
    });
  }
  if (statuses.ending && mode !== "textstream") {
    shown.push({
      key: "ending",
      text: statuses.ending.text,
      tone: statuses.ending.kind === "error" ? "error" : "default",
    });
  }
  return shown;
};

export class StatusesStore {
  readonly statuses = signal<GameStatuses>(NO_GAME_STATUSES);

  clear() {
    this.statuses.value = NO_GAME_STATUSES;
  }

  receive(message: unknown) {
    if (DidChangeGameStateMessage.type.isNotification(message)) {
      this.statuses.value = message.params.statuses ?? NO_GAME_STATUSES;
    }
  }
}

const statuses = new StatusesStore();

export default statuses;
