import {
  isValidSetting,
  PROJECT_SETTINGS_SCHEMA,
  type ProjectSettings,
  type SettingSpec,
  type SettingValue,
} from "./settingsSchema";

export const SETTINGS_JSON_PATH = ".vscode/settings.json";

const EXTENSION_PREFIX = "sparkdown.";

export type ExtensionDefaults = Readonly<Record<string, unknown>>;

interface ExtensionManifest {
  contributes?: {
    configuration?:
      | { properties?: Record<string, { default?: unknown }> }
      | { properties?: Record<string, { default?: unknown }> }[];
  };
}

export const extensionDefaults = (
  manifest: ExtensionManifest,
): ExtensionDefaults => {
  const configuration = manifest.contributes?.configuration ?? [];
  const groups = Array.isArray(configuration) ? configuration : [configuration];
  const defaults: Record<string, unknown> = {};
  for (const group of groups) {
    for (const [key, property] of Object.entries(group.properties ?? {})) {
      defaults[key] = property.default;
    }
  }
  return defaults;
};

export const loadExtensionDefaults = async (): Promise<ExtensionDefaults> => {
  const manifest = await import(
    "../../../../../../vscode-sparkdown/package.json"
  );
  return extensionDefaults(manifest.default as ExtensionManifest);
};

const extensionKeysOf = (spec: SettingSpec): string[] =>
  (spec.configurationKeys ?? []).map((path) => EXTENSION_PREFIX + path);

export const projectSettingsJson = (
  settings: ProjectSettings,
  defaults: ExtensionDefaults,
): string | undefined => {
  const changed: Record<string, SettingValue> = {};
  const values = settings as Record<string, SettingValue>;
  for (const [key, spec] of Object.entries(PROJECT_SETTINGS_SCHEMA)) {
    const value = values[key]!;
    for (const extensionKey of extensionKeysOf(spec)) {
      const defaultValue = Object.hasOwn(defaults, extensionKey)
        ? defaults[extensionKey]
        : spec.default;
      if (defaultValue !== value) {
        changed[extensionKey] = value;
      }
    }
  }
  if (Object.keys(changed).length === 0) {
    return undefined;
  }
  return `${JSON.stringify(changed, null, 2)}\n`;
};

const stripJsonComments = (text: string): string => {
  let result = "";
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    if (c === '"') {
      const start = i;
      i += 1;
      while (i < text.length && text[i] !== '"') {
        i += text[i] === "\\" ? 2 : 1;
      }
      i += 1;
      result += text.slice(start, i);
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") {
        i += 1;
      }
    } else if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end < 0 ? text.length : end + 2;
    } else {
      result += c;
      i += 1;
    }
  }
  return result;
};

const stripTrailingCommas = (json: string): string => {
  let result = "";
  let i = 0;
  while (i < json.length) {
    const c = json[i]!;
    if (c === '"') {
      const start = i;
      i += 1;
      while (i < json.length && json[i] !== '"') {
        i += json[i] === "\\" ? 2 : 1;
      }
      i += 1;
      result += json.slice(start, i);
    } else if (c === ",") {
      let j = i + 1;
      while (j < json.length && /\s/.test(json[j]!)) {
        j += 1;
      }
      if (json[j] !== "}" && json[j] !== "]") {
        result += c;
      }
      i += 1;
    } else {
      result += c;
      i += 1;
    }
  }
  return result;
};

const parseSettingsJson = (text: string): Record<string, unknown> => {
  try {
    const parsed: unknown = JSON.parse(
      stripTrailingCommas(stripJsonComments(text)),
    );
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

export const projectSettingsFromJson = (
  text: string,
): Partial<ProjectSettings> => {
  const parsed = parseSettingsJson(text);
  const seeded: Record<string, SettingValue> = {};
  for (const [key, spec] of Object.entries(PROJECT_SETTINGS_SCHEMA)) {
    for (const extensionKey of extensionKeysOf(spec)) {
      const value = Object.hasOwn(parsed, extensionKey)
        ? parsed[extensionKey]
        : undefined;
      if (isValidSetting(spec, value)) {
        seeded[key] = value as SettingValue;
        break;
      }
    }
  }
  return seeded as Partial<ProjectSettings>;
};
