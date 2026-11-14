import { PlayBeatMessage } from "@impower/spark-editor-protocol/src/protocols/preview/PlayBeatMessage";
import { SetAutoPlayBeatsMessage } from "@impower/spark-editor-protocol/src/protocols/preview/SetAutoPlayBeatsMessage";
import { SetPlayAudioMessage } from "@impower/spark-editor-protocol/src/protocols/preview/SetPlayAudioMessage";
import * as vscode from "vscode";

export const AUTO_PLAY_BEATS_SETTING = "previewAutoPlayBeats";

export const PLAY_AUDIO_SETTING = "previewPlayAudio";

export const REPLAY_BEAT_COMMAND = "sparkdown.game.replayBeat";

export type ReduceMotion = "on" | "off" | "auto";

export const reducesMotion = (
  setting: ReduceMotion | undefined,
  systemReducesMotion: boolean,
) => setting === "on" || (setting !== "off" && systemReducesMotion);

export const autoPlayBeatsRequest = (systemReducesMotion: boolean) => {
  const game = vscode.workspace.getConfiguration("sparkdown.game");
  const motion = vscode.workspace
    .getConfiguration("workbench")
    .get<ReduceMotion>("reduceMotion");
  return SetAutoPlayBeatsMessage.type.request({
    enabled:
      game.get<boolean>(AUTO_PLAY_BEATS_SETTING) === true &&
      game.get<boolean>("previewSynchronizedWithCursor") !== false &&
      !reducesMotion(motion, systemReducesMotion),
  });
};

export const playAudioRequest = () =>
  SetPlayAudioMessage.type.request({
    enabled:
      vscode.workspace
        .getConfiguration("sparkdown.game")
        .get<boolean>(PLAY_AUDIO_SETTING) === true,
  });

export const playBeatRequest = () => PlayBeatMessage.type.request({});
