import { effect, type ReadonlySignal } from "@preact/signals";

export const THEMES = ["charcoal", "chalk", "midnight"] as const;

export type Theme = (typeof THEMES)[number];

export const THEME_PREFERENCES = ["automatic", ...THEMES] as const;

export const LIGHT_SCHEME_QUERY = "(prefers-color-scheme: light)";

export const resolveTheme = (
  preference: string,
  prefersLight: boolean,
): Theme =>
  THEMES.find((theme) => theme === preference) ??
  (prefersLight ? "chalk" : "charcoal");

const themeColorsOf = (
  meta: HTMLMetaElement | null,
): Record<string, string> => {
  try {
    return JSON.parse(meta?.dataset["themeColors"] || "{}");
  } catch {
    return {};
  }
};

export const applyTheme = (
  root: HTMLElement,
  theme: ReadonlySignal<Theme>,
): (() => void) => {
  const meta = root.ownerDocument.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  );
  const colors = themeColorsOf(meta);
  return effect(() => {
    const value = theme.value;
    root.dataset["theme"] = value;
    const color = colors[value];
    if (meta && color) {
      meta.content = color;
    }
  });
};
