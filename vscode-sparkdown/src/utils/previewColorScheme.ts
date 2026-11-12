import { SetSimulatedColorSchemeMessage } from "@impower/spark-engine/src/game/core/classes/messages/SetSimulatedColorSchemeMessage";
import type { ColorScheme } from "@impower/spark-engine/src/game/core/classes/messages/SetSimulatedColorSchemeMessage";
import * as vscode from "vscode";

export const colorSchemeOfThemeKind = (kind: vscode.ColorThemeKind): ColorScheme =>
  kind === vscode.ColorThemeKind.Light ||
  kind === vscode.ColorThemeKind.HighContrastLight
    ? "light"
    : "dark";

export const simulatedColorSchemeRequest = () =>
  SetSimulatedColorSchemeMessage.type.request({
    color_scheme: colorSchemeOfThemeKind(vscode.window.activeColorTheme.kind),
  });
