import type { DidChangeConfigurationParams } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeConfigurationMessage";
import {
  computed,
  effect,
  signal,
  type ReadonlySignal,
} from "@preact/signals";
import workspace from "../WorkspaceStore";
import {
  buildConfiguration,
  isValidSetting,
  PREFERENCES_SCHEMA,
  PROJECT_SETTINGS_SCHEMA,
  resolveSettings,
  type PreferenceKey,
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

  readonly preferences: ReadonlySignal<Preferences>;

  readonly projectSettings: ReadonlySignal<ProjectSettings>;

  readonly configuration: ReadonlySignal<Record<string, unknown>>;

  constructor(
    projectId: ReadonlySignal<string>,
    storage: Storage | undefined = typeof localStorage === "undefined"
      ? undefined
      : localStorage,
  ) {
    this._storage = storage;
    this._storedPreferences = signal<StoredSettings>(
      readStored(storage, PREFERENCES_STORAGE_KEY),
    );
    const id = projectId.peek();
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
    this.configuration = computed(() =>
      buildConfiguration(this.preferences.value, this.projectSettings.value),
    );
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

export default workspaceSettings;
