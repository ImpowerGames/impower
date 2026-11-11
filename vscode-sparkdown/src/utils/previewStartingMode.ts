import { SetStartingDisplayModeMessage } from "@impower/spark-engine/src/game/core/classes/messages/SetStartingDisplayModeMessage";
import * as vscode from "vscode";

export type PreviewStartingMode = "visualNovel" | "interactiveFiction";

export const PREVIEW_STARTING_MODE_SETTING = "previewStartingMode";

export const startingDisplayModeRequest = () =>
  SetStartingDisplayModeMessage.type.request({
    mode:
      vscode.workspace
        .getConfiguration("sparkdown.game")
        .get<PreviewStartingMode>(PREVIEW_STARTING_MODE_SETTING) ===
      "interactiveFiction"
        ? "textstream"
        : "textbox",
  });

export const setPreviewStartingMode = (mode: PreviewStartingMode) =>
  vscode.workspace
    .getConfiguration("sparkdown.game")
    .update(
      PREVIEW_STARTING_MODE_SETTING,
      mode,
      vscode.ConfigurationTarget.Global,
    );
