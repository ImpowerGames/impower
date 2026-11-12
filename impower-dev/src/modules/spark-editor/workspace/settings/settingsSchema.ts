import { GAME_ASPECT_RATIOS } from "@impower/spark-engine/src/game/core/classes/messages/ResizeGameMessage";
import type { StartingDisplayMode } from "@impower/spark-engine/src/game/core/classes/messages/SetStartingDisplayModeMessage";
import type { ColorScheme } from "@impower/spark-engine/src/game/core/classes/messages/SetSimulatedColorSchemeMessage";
import { INDENT_GUIDES } from "@impower/sparkdown-document-views/src/cm-script-appearance/scriptAppearanceOptions";
import { SCRIPT_FILES_GLOB } from "../../utils/scriptFiles";
import { SHORTCUT_PREFERENCES } from "../shortcuts/shortcutTable";
import {
  colorSchemeOfTheme,
  SURFACES,
  SYNTAX_PALETTES,
  THEME_PREFERENCES,
} from "./applyTheme";

export const PORTRAIT_CROP = { min: 25, max: 100, step: 5, default: 50 } as const;

const PORTRAIT_CROPS: readonly number[] = Array.from(
  { length: (PORTRAIT_CROP.max - PORTRAIT_CROP.min) / PORTRAIT_CROP.step + 1 },
  (_, index) => PORTRAIT_CROP.min + index * PORTRAIT_CROP.step,
);

export type SettingValue = boolean | number | string;

export interface SettingSpec<T extends SettingValue = SettingValue> {
  readonly default: T;
  readonly choices?: readonly T[];
  readonly maxLength?: number;
  readonly configurationKeys?: readonly string[];
}

export const SETTING_TEXT_MAX_LENGTH = 40;

function setting(defaultValue: string, options?: Omit<SettingSpec<string>, "default">): SettingSpec<string>;
function setting(defaultValue: number, options?: Omit<SettingSpec<number>, "default">): SettingSpec<number>;
function setting(defaultValue: boolean, options?: Omit<SettingSpec<boolean>, "default">): SettingSpec<boolean>;
function setting(defaultValue: SettingValue, options: Omit<SettingSpec, "default"> = {}): SettingSpec {
  return { default: defaultValue, ...options };
}

const choice = <const C extends readonly string[]>(
  defaultValue: C[number],
  choices: C,
  options: Omit<SettingSpec<C[number]>, "default" | "choices"> = {},
): SettingSpec<C[number]> & { readonly choices: C } => ({
  default: defaultValue,
  choices,
  ...options,
});

const configured = (...configurationKeys: string[]) => ({
  configurationKeys,
});

export const PREVIEW_MODES = ["game", "textstream", "screenplay"] as const;

export type PreviewMode = (typeof PREVIEW_MODES)[number];

export const playsGame = (mode: PreviewMode) => mode !== "screenplay";

export const fillsPane = (mode: PreviewMode) => mode === "textstream";

export const startingDisplayModeOf = (mode: PreviewMode): StartingDisplayMode =>
  mode === "textstream" ? "textstream" : "textbox";

export const PREVIEW_COLOR_SCHEMES = ["editor", "light", "dark"] as const;

export type PreviewColorScheme = (typeof PREVIEW_COLOR_SCHEMES)[number];

export const simulatedColorSchemeOf = (
  choice: PreviewColorScheme,
  theme: string,
): ColorScheme => (choice === "editor" ? colorSchemeOfTheme(theme) : choice);

export const SCREENPLAY_PAPERS = ["paper", "theme"] as const;

export const PREFERENCES_SCHEMA = {
  theme: choice("automatic", THEME_PREFERENCES),
  surfaces: choice("unified", SURFACES),
  syntaxPalette: choice("softened", SYNTAX_PALETTES),
  boldDeclarationNames: setting(false),
  boldSpeakerNames: setting(false),
  boldContainerNames: setting(false),
  tintedDialogue: setting(false),
  italicComments: setting(true),
  emphasizeMarkup: setting(true),
  highlightMatchingSymbols: setting(true),
  hoverPreviews: setting(true),
  lineNumbers: setting(false),
  indentGuides: choice("block", INDENT_GUIDES),
  autoCloseBrackets: setting(true),
  autoRenameFiles: setting(true, configured("editor.autoRenameFiles")),
  suggestAutocompletions: setting(true),
  previewMode: choice("game", PREVIEW_MODES),
  previewFollowsCursor: setting(true),
  previewIdleAnimations: setting(true),
  previewTypingPauses: setting(false),
  previewScreenplaySync: setting(true),
  screenplayPaper: choice("paper", SCREENPLAY_PAPERS),
  screenplayPaperTexture: setting(false),
  ...SHORTCUT_PREFERENCES,
  portraitCrop: setting(PORTRAIT_CROP.default, { choices: PORTRAIT_CROPS }),
} as const satisfies Record<string, SettingSpec>;

export const PROJECT_SETTINGS_SCHEMA = {
  scriptFiles: setting(SCRIPT_FILES_GLOB, configured("scriptFiles")),
  imageFiles: setting(
    "*.{png,apng,jpeg,jpg,gif,bmp,svg,webp}",
    configured("imageFiles"),
  ),
  audioFiles: setting(
    "*.{mid,wav,mp3,mp2,ogg,aac,opus,flac}",
    configured("audioFiles"),
  ),
  videoFiles: setting(
    "*.{mp4,webm,mov,m4v,ogv,mkv}",
    configured("videoFiles"),
  ),
  fontFiles: setting("*.{ttf,woff,woff2,otf}", configured("fontFiles")),
  worldFiles: setting("*.{js}", configured("worldFiles")),
  addFolderBackdrop: setting("Backdrops", configured("addMenu.folderBackdrop")),
  addFolderPortrait: setting("Portraits", configured("addMenu.folderPortrait")),
  addFolderMusic: setting("Music", configured("addMenu.folderMusic")),
  addFolderSound: setting("Sounds", configured("addMenu.folderSound")),
  screenplayTitlePage: setting(
    true,
    configured("screenplay.pages.printTitlePage"),
  ),
  screenplayHeadingsBold: setting(
    true,
    configured("screenplay.formatting.printHeadingsBold"),
  ),
  screenplaySceneNumbers: choice(
    "none",
    ["none", "left", "right", "both"],
    configured("screenplay.numbering.printSceneNumbers"),
  ),
  screenplaySceneNames: setting(
    false,
    configured("screenplay.markup.printSceneIdentifiers"),
  ),
  screenplayBranchNames: setting(false),
  screenplayFunctionNames: setting(
    false,
    configured("screenplay.markup.printFunctionIdentifiers"),
  ),
  screenplayKnotNames: setting(
    false,
    configured(
      "screenplay.markup.printKnotIdentifiers",
      "screenplay.markup.printStitchIdentifiers",
    ),
  ),
  screenplayPaperSize: choice(
    "usletter",
    ["usletter", "a4"],
    configured("screenplay.pdf.printPaperSize"),
  ),
  screenplayPageNumbers: setting(
    true,
    configured("screenplay.pdf.numbering.printPageNumbers"),
  ),
  screenplaySplitDialogue: setting(
    true,
    configured(
      "screenplay.pdf.composition.pageBreaks.printDialogueSplitAcrossPages",
    ),
  ),
  screenplayMore: setting("(MORE)", {
    maxLength: SETTING_TEXT_MAX_LENGTH,
    ...configured("screenplay.pdf.composition.printDialogueMORE"),
  }),
  screenplayContd: setting("(CONT'D)", {
    maxLength: SETTING_TEXT_MAX_LENGTH,
    ...configured("screenplay.pdf.composition.printDialogueCONTD"),
  }),
  screenplayBookmarks: setting(
    true,
    configured("screenplay.pdf.bookmarks.printBookmarks"),
  ),
  screenplayHiddenBookmarks: setting(
    true,
    configured("screenplay.pdf.bookmarks.printBookmarksForInvisibleHeadings"),
  ),
  previewAspectRatio: choice("auto", ["auto", ...GAME_ASPECT_RATIOS]),
  previewPanelHeight: setting(44),
  previewColorScheme: choice("editor", PREVIEW_COLOR_SCHEMES),
  problemsScriptCardOpen: setting(true),
  problemsPlayedCardOpen: setting(true),
  problemsVariablesCardOpen: setting(true),
  problemsWatchCardOpen: setting(true),
  problemsCallStackCardOpen: setting(true),
} as const satisfies Record<string, SettingSpec>;

type ValuesOf<S extends Record<string, SettingSpec>> = {
  -readonly [K in keyof S]: S[K] extends SettingSpec<infer T>
    ? T extends boolean
      ? boolean
      : S[K] extends { readonly choices: readonly unknown[] }
        ? T
        : T extends string
          ? string
          : T
    : never;
};

export type Preferences = ValuesOf<typeof PREFERENCES_SCHEMA>;
export type PreferenceKey = keyof Preferences;
export type ProjectSettings = ValuesOf<typeof PROJECT_SETTINGS_SCHEMA>;
export type ProjectSettingKey = keyof ProjectSettings;

export const isValidSetting = (spec: SettingSpec, value: unknown): boolean =>
  typeof value === typeof spec.default &&
  (!spec.choices || spec.choices.includes(value as SettingValue));

export const resolveSettings = <S extends Record<string, SettingSpec>>(
  schema: S,
  stored: Record<string, unknown>,
): ValuesOf<S> => {
  const resolved: Record<string, SettingValue> = {};
  for (const [key, spec] of Object.entries(schema)) {
    const value = Object.hasOwn(stored, key) ? stored[key] : undefined;
    const valid = isValidSetting(spec, value)
      ? (value as SettingValue)
      : spec.default;
    resolved[key] =
      typeof valid === "string" && spec.maxLength !== undefined
        ? valid.slice(0, spec.maxLength)
        : valid;
  }
  return resolved as ValuesOf<S>;
};

const setPath = (
  target: Record<string, unknown>,
  path: string,
  value: unknown,
) => {
  const parts = path.split(".");
  let node = target;
  for (const part of parts.slice(0, -1)) {
    const next = node[part];
    if (next && typeof next === "object") {
      node = next as Record<string, unknown>;
    } else {
      const created: Record<string, unknown> = {};
      node[part] = created;
      node = created;
    }
  }
  node[parts[parts.length - 1]!] = value;
};

export const buildConfiguration = (
  preferences: Preferences,
  projectSettings: ProjectSettings,
): Record<string, unknown> => {
  const configuration: Record<string, unknown> = {};
  const scopes: [Record<string, SettingSpec>, Record<string, unknown>][] = [
    [PREFERENCES_SCHEMA, preferences],
    [PROJECT_SETTINGS_SCHEMA, projectSettings],
  ];
  for (const [schema, values] of scopes) {
    for (const [key, spec] of Object.entries(schema)) {
      for (const path of spec.configurationKeys ?? []) {
        setPath(configuration, path, values[key]);
      }
    }
  }
  return configuration;
};
