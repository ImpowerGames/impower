import { effect, type ReadonlySignal } from "@preact/signals";

export const THEMES = ["charcoal", "chalk", "midnight"] as const;

export type Theme = (typeof THEMES)[number];

export const THEME_PREFERENCES = ["automatic", ...THEMES] as const;

export const LIGHT_SCHEME_QUERY = "(prefers-color-scheme: light)";

export const resolveTheme = (preference: string, prefersLight: boolean): Theme =>
  THEMES.find((theme) => theme === preference) ??
  (prefersLight ? "chalk" : "charcoal");

export const applyTheme = (
  root: HTMLElement,
  theme: ReadonlySignal<Theme>,
): (() => void) =>
  effect(() => {
    root.dataset["theme"] = theme.value;
  });
