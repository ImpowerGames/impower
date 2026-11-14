import type { DidChangeConfigurationParams } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeConfigurationMessage";
import type { ScriptAppearance } from "@impower/sparkdown-document-views/src/cm-script-appearance/scriptAppearanceOptions";
import type { ScreenplayConfig } from "../../../../../../packages/sparkdown-screenplay/src/types/ScreenplayConfig";
import {
  computed,
  effect,
  signal,
  type ReadonlySignal,
} from "@preact/signals";
import { setAssetFiles } from "../../utils/assetTypes";
import { setScriptFiles } from "../../utils/scriptFiles";
import workspace from "../WorkspaceStore";
import {
  LIGHT_SCHEME_QUERY,
  resolveAppearance,
  resolveTheme,
  type Appearance,
  type Theme,
} from "./applyTheme";
import { screenplayConfig } from "./screenplaySettings";
import {
  buildConfiguration,
  isValidSetting,
  PREFERENCES_SCHEMA,
  previewMotionOf,
  PROJECT_SETTINGS_SCHEMA,
  REDUCED_MOTION_QUERY,
  resolveSettings,
  type PreferenceKey,
  type PreviewMotion,
  type Preferences,
  type ProjectSettingKey,
  type ProjectSettings,
  type SettingSpec,
} from "./settingsSchema";

export const PREFERENCES_STORAGE_KEY = "settings/preferences";
export const PROJECT_SETTINGS_STORAGE_KEY_PREFIX = "settings/project/";

type StoredSettings = Readonly<Record<string, unknown>>;

type ConfigurationListener = (params: DidChangeConfigurationParams) => void;

const projectStorageKey = (projectId: string) =>
  PROJECT_SETTINGS_STORAGE_KEY_PREFIX + projectId;

const readStored = (storage: Storage | undefined, key: string) => {
  const text = storage?.getItem(key);
  if (!text) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as StoredSettings)
      : {};
  } catch {
    return {};
  }
};

const assertValid = (
  schema: Record<string, SettingSpec>,
  key: string,
  value: unknown,
) => {
  const spec = Object.hasOwn(schema, key) ? schema[key] : undefined;
  if (!spec) {
    throw new TypeError(`Unknown setting "${key}"`);
  }
  if (!isValidSetting(spec, value)) {
    throw new TypeError(
      `Invalid value for setting "${key}": ${JSON.stringify(value)}`,
    );
  }
};

const withoutKnownKeys = (
  stored: StoredSettings,
  schema: Record<string, SettingSpec>,
) =>
  Object.fromEntries(
    Object.entries(stored).filter(([key]) => !Object.hasOwn(schema, key)),
  );

export class WorkspaceSettings {
  protected readonly _storage: Storage | undefined;

  protected readonly _storedPreferences;

  protected readonly _storedProject;

  protected readonly _listeners = new Set<ConfigurationListener>();

  protected readonly _disposeProjectEffect: () => void;

  protected readonly _lightScheme: MediaQueryList | undefined;

  protected readonly _prefersLight;

  protected readonly _onSchemeChange = (e: MediaQueryListEvent) => {
    this._prefersLight.value = e.matches;
  };

  protected readonly _reducedMotionQuery: MediaQueryList | undefined;

  protected readonly _reducedMotion;

  protected readonly _onReducedMotionChange = (e: MediaQueryListEvent) => {
    this._reducedMotion.value = e.matches;
  };

  readonly reducedMotion: ReadonlySignal<boolean>;

  readonly previewMotion: ReadonlySignal<PreviewMotion>;

  readonly preferences: ReadonlySignal<Preferences>;

  readonly projectSettings: ReadonlySignal<ProjectSettings>;

  readonly configuration: ReadonlySignal<Record<string, unknown>>;

  readonly screenplayConfig: ReadonlySignal<ScreenplayConfig>;

  readonly theme: ReadonlySignal<Theme>;

  readonly appearance: ReadonlySignal<Appearance>;

  readonly scriptAppearance: ReadonlySignal<ScriptAppearance>;

  constructor(
    projectId: ReadonlySignal<string>,
    storage: Storage | undefined = typeof localStorage === "undefined"
      ? undefined
      : localStorage,
    lightScheme: MediaQueryList | undefined = typeof matchMedia === "function"
      ? matchMedia(LIGHT_SCHEME_QUERY)
      : undefined,
    reducedMotion: MediaQueryList | undefined = typeof matchMedia === "function"
      ? matchMedia(REDUCED_MOTION_QUERY)
      : undefined,
  ) {
    this._storage = storage;
    this._lightScheme = lightScheme;
    this._prefersLight = signal(lightScheme?.matches ?? false);
    lightScheme?.addEventListener("change", this._onSchemeChange);
    this._reducedMotionQuery = reducedMotion;
    this._reducedMotion = signal(reducedMotion?.matches ?? false);
    reducedMotion?.addEventListener("change", this._onReducedMotionChange);
    this.reducedMotion = this._reducedMotion;
    this._storedPreferences = signal<StoredSettings>(
      readStored(storage, PREFERENCES_STORAGE_KEY),
    );
    const id = projectId.value;
    this._storedProject = signal<{ id: string; stored: StoredSettings }>({
      id,
      stored: readStored(storage, projectStorageKey(id)),
    });
    this.preferences = computed(() =>
      resolveSettings(PREFERENCES_SCHEMA, this._storedPreferences.value),
    );
    this.projectSettings = computed(() =>
      resolveSettings(PROJECT_SETTINGS_SCHEMA, this._storedProject.value.stored),
    );
    this.previewMotion = computed(() =>
      previewMotionOf(this.preferences.value, this._reducedMotion.value),
    );
    this.configuration = computed(() =>
      buildConfiguration(this.preferences.value, this.projectSettings.value),
    );
    this.screenplayConfig = computed(() =>
      screenplayConfig(this.projectSettings.value),
    );
    this.theme = computed(() =>
      resolveTheme(this.preferences.value.theme, this._prefersLight.value),
    );
    this.appearance = computed(() =>
      resolveAppearance(
        this.theme.value,
        this.preferences.value.surfaces,
        this.preferences.value.syntaxPalette,
      ),
    );
    this.scriptAppearance = computed(() => {
      const preferences = this.preferences.value;
      return {
        boldDeclarationNames: preferences.boldDeclarationNames,
        boldSpeakerNames: preferences.boldSpeakerNames,
        boldContainerNames: preferences.boldContainerNames,
        tintedDialogue: preferences.tintedDialogue,
        italicComments: preferences.italicComments,
        emphasizeMarkup: preferences.emphasizeMarkup,
        highlightMatchingSymbols: preferences.highlightMatchingSymbols,
        hoverPreviews: preferences.hoverPreviews,
        lineNumbers: preferences.lineNumbers,
        indentGuides: preferences.indentGuides,
        autoCloseBrackets: preferences.autoCloseBrackets,
        suggestAutocompletions: preferences.suggestAutocompletions,
      };
    });
    this._disposeProjectEffect = effect(() => {
      const nextId = projectId.value;
      if (nextId !== this._storedProject.peek().id) {
        this._storedProject.value = {
          id: nextId,
          stored: readStored(this._storage, projectStorageKey(nextId)),
        };
        this.notifyConfigurationChanged();
      }
    });
  }

  dispose() {
    this._disposeProjectEffect();
    this._lightScheme?.removeEventListener("change", this._onSchemeChange);
    this._reducedMotionQuery?.removeEventListener(
      "change",
      this._onReducedMotionChange,
    );
    this._listeners.clear();
  }

  onDidChangeConfiguration(listener: ConfigurationListener): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  protected notifyConfigurationChanged() {
    const params: DidChangeConfigurationParams = {
      settings: this.configuration.peek(),
    };
    for (const listener of this._listeners) {
      listener(params);
    }
  }

  protected save(key: string, stored: StoredSettings) {
    this._storage?.setItem(key, JSON.stringify(stored));
  }

  setPreference = <K extends PreferenceKey>(key: K, value: Preferences[K]) => {
    assertValid(PREFERENCES_SCHEMA, key, value);
    const stored = { ...this._storedPreferences.peek(), [key]: value };
    this.save(PREFERENCES_STORAGE_KEY, stored);
    this._storedPreferences.value = stored;
    this.notifyConfigurationChanged();
  };

  setProjectSetting = <K extends ProjectSettingKey>(
    key: K,
    value: ProjectSettings[K],
  ) => {
    assertValid(PROJECT_SETTINGS_SCHEMA, key, value);
    const current = this._storedProject.peek();
    const stored = { ...current.stored, [key]: value };
    this.save(projectStorageKey(current.id), stored);
    this._storedProject.value = { id: current.id, stored };
    this.notifyConfigurationChanged();
  };

  resetPreferences = (keys: readonly PreferenceKey[]) => {
    const current = this._storedPreferences.peek();
    if (!keys.some((key) => Object.hasOwn(current, key))) {
      return;
    }
    const stored = Object.fromEntries(
      Object.entries(current).filter(([key]) => !keys.includes(key as PreferenceKey)),
    );
    this.save(PREFERENCES_STORAGE_KEY, stored);
    this._storedPreferences.value = stored;
    this.notifyConfigurationChanged();
  };

  resetProjectSettings = (keys: readonly ProjectSettingKey[]) => {
    const current = this._storedProject.peek();
    if (!keys.some((key) => Object.hasOwn(current.stored, key))) {
      return;
    }
    const stored = Object.fromEntries(
      Object.entries(current.stored).filter(([key]) => !keys.includes(key as ProjectSettingKey)),
    );
    this.save(projectStorageKey(current.id), stored);
    this._storedProject.value = { id: current.id, stored };
    this.notifyConfigurationChanged();
  };

  replaceProjectSettings(projectId: string, values: Partial<ProjectSettings>) {
    for (const [key, value] of Object.entries(values)) {
      assertValid(PROJECT_SETTINGS_SCHEMA, key, value);
    }
    const current = this._storedProject.peek();
    const previous =
      current.id === projectId
        ? current.stored
        : readStored(this._storage, projectStorageKey(projectId));
    const stored = {
      ...withoutKnownKeys(previous, PROJECT_SETTINGS_SCHEMA),
      ...values,
    };
    this.save(projectStorageKey(projectId), stored);
    if (current.id === projectId) {
      this._storedProject.value = { id: projectId, stored };
      this.notifyConfigurationChanged();
    }
  }
}

const workspaceSettings = new WorkspaceSettings(workspace.signals.projectId);

effect(() => {
  const { scriptFiles, imageFiles, audioFiles, videoFiles, fontFiles } = workspaceSettings.projectSettings.value;
  setScriptFiles(scriptFiles);
  setAssetFiles({ imageFiles, audioFiles, videoFiles, fontFiles });
});

export default workspaceSettings;
