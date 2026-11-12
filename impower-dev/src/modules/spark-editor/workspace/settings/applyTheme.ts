import type { ColorScheme } from "@impower/spark-engine/src/game/core/classes/messages/SetSimulatedColorSchemeMessage";
import { effect, type ReadonlySignal } from "@preact/signals";

export const THEMES = [
  "charcoal",
  "chalk",
  "ink",
  "paper",
  "graphite",
  "warm",
  "midnight",
  "dusk",
] as const;

export type Theme = (typeof THEMES)[number];

export const THEME_PREFERENCES = ["automatic", ...THEMES] as const;

export const ADJUSTABLE_THEMES: readonly Theme[] = ["graphite", "warm"];

export const LIGHT_THEMES: readonly Theme[] = ["chalk", "paper"];

export const colorSchemeOfTheme = (theme: string): ColorScheme =>
  LIGHT_THEMES.some((light) => light === theme) ? "light" : "dark";

export const SURFACES = ["unified", "layered"] as const;

export type Surfaces = (typeof SURFACES)[number];

export const SYNTAX_PALETTES = ["original", "softened"] as const;

export type SyntaxPalette = (typeof SYNTAX_PALETTES)[number];

export interface Appearance {
  readonly theme: Theme;
  readonly surfaces?: Surfaces;
  readonly syntax?: SyntaxPalette;
}

export const LIGHT_SCHEME_QUERY = "(prefers-color-scheme: light)";

export const resolveTheme = (
  preference: string,
  prefersLight: boolean,
): Theme =>
  THEMES.find((theme) => theme === preference) ??
  (prefersLight ? "chalk" : "charcoal");

export const resolveAppearance = (
  theme: Theme,
  surfaces: Surfaces,
  syntax: SyntaxPalette,
): Appearance =>
  ADJUSTABLE_THEMES.includes(theme) ? { theme, surfaces, syntax } : { theme };

const themeColorsOf = (
  meta: HTMLMetaElement | null,
): Record<string, string> => {
  try {
    return JSON.parse(meta?.dataset["themeColors"] || "{}");
  } catch {
    return {};
  }
};

const setOrRemove = (root: HTMLElement, key: string, value?: string) => {
  if (value) {
    root.dataset[key] = value;
  } else {
    delete root.dataset[key];
  }
};

export const applyTheme = (
  root: HTMLElement,
  appearance: ReadonlySignal<Appearance>,
): (() => void) => {
  const meta = root.ownerDocument.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  );
  const colors = themeColorsOf(meta);
  return effect(() => {
    const { theme, surfaces, syntax } = appearance.value;
    root.dataset["theme"] = theme;
    setOrRemove(root, "surfaces", surfaces);
    setOrRemove(root, "syntax", syntax);
    const color = colors[theme];
    if (meta && color) {
      meta.content = color;
    }
  });
};
