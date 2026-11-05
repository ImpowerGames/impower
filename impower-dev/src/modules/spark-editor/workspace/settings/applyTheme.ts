import { effect, type ReadonlySignal } from "@preact/signals";
import type { Preferences } from "./settingsSchema";

export const THEMES = ["midnight"] as const;

export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = "midnight";

export const resolveTheme = (preference: string): Theme =>
  THEMES.find((theme) => theme === preference) ?? DEFAULT_THEME;

export const applyTheme = (
  root: HTMLElement,
  preferences: ReadonlySignal<Pick<Preferences, "theme">>,
): (() => void) =>
  effect(() => {
    root.dataset["theme"] = resolveTheme(preferences.value.theme);
  });
