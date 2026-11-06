import type { Theme } from "../../workspace/settings/applyTheme";
import type { Preferences } from "../../workspace/settings/settingsSchema";

type ThemePreference = Preferences["theme"];

export type ThemeChoice = {
  readonly value: ThemePreference;
  readonly label: string;
  readonly detail: string;
  readonly swatch: Theme;
  readonly pairedSwatch?: Theme;
  readonly description?: string;
};

export const THEME_CHOICES: readonly ThemeChoice[] = [
  {
    value: "automatic",
    label: "Automatic",
    detail: "Charcoal or Chalk, following your device",
    swatch: "charcoal",
    pairedSwatch: "chalk",
  },
  {
    value: "charcoal",
    label: "Charcoal",
    detail: "Neutral grey · peach accents",
    swatch: "charcoal",
    description: "The default dark theme. Ink’s syntax colors and accent on neutral charcoal.",
  },
  {
    value: "chalk",
    label: "Chalk",
    detail: "Neutral white · terracotta accents",
    swatch: "chalk",
    description: "The default light theme. Sepia’s syntax colors and accent on neutral white.",
  },
  {
    value: "ink",
    label: "Ink",
    detail: "Warm charcoal · peach accents",
    swatch: "ink",
    description:
      "Warm charcoal, with every syntax color at its own hue and the writer’s words as the brightest tier. Speaker cues use the accent color.",
  },
  {
    value: "paper",
    label: "Sepia",
    detail: "Warm cream · terracotta accents",
    swatch: "paper",
    description:
      "Warm cream, with every syntax color keeping its hue, darkened to read at the same contrast as the dark themes. Speaker cues use the accent color.",
  },
  {
    value: "graphite",
    label: "Graphite",
    detail: "Neutral charcoal · clay accents",
    swatch: "graphite",
  },
  {
    value: "warm",
    label: "Warm Folio",
    detail: "Soft brown · peach accents",
    swatch: "warm",
  },
  {
    value: "midnight",
    label: "Midnight",
    detail: "Original Spark Engine colors",
    swatch: "midnight",
    description: "The original engine’s navy surfaces and syntax colors. Your other themes keep their settings.",
  },
  {
    value: "dusk",
    label: "Dusk",
    detail: "Quieter navy · original syntax",
    swatch: "dusk",
    description:
      "Midnight with slightly quieter navy backgrounds. The same white text, soft blue accent and original syntax colors.",
  },
];

export const themeNote = (preference: ThemePreference, resolved: Theme): string => {
  if (preference === "automatic") {
    const name = THEME_CHOICES.find((choice) => choice.value === resolved)?.label ?? resolved;
    return `Follows your device’s light or dark setting. Right now that is ${name}.`;
  }
  return THEME_CHOICES.find((choice) => choice.value === preference)?.description ?? "";
};
