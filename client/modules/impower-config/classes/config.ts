import {
  activate as _activate,
  fetchAndActivate as _fetchAndActivate,
  fetchConfig as _fetchConfig,
  getValue as _getValue,
  getRemoteConfig,
} from "@firebase/remote-config";
import archetypes from "../../../../concept-generator/src/input/archetypes.txt";
import phrases from "../../../../concept-generator/src/input/phrases.txt";
import terms from "../../../../concept-generator/src/output/terms.json";
import colors from "../../../resources/json/colors.json";
import abbreviations from "../../../resources/json/en/abbreviations.json";
import capitalizations from "../../../resources/json/en/capitalizations.json";
import catalysts from "../../../resources/json/en/catalysts.json";
import messages from "../../../resources/json/en/messages.json";
import moods from "../../../resources/json/en/moods.json";
import projectTags from "../../../resources/json/en/projectTags.json";
import regexes from "../../../resources/json/en/regexes.json";
import resourceTags from "../../../resources/json/en/resourceTags.json";
import roleTags from "../../../resources/json/en/roleTags.json";
import tagDisambiguations from "../../../resources/json/en/tagDisambiguations.json";
import tagColorNames from "../../../resources/json/tagColorNames.json";
import tagIconNames from "../../../resources/json/tagIconNames.json";
import tagPatterns from "../../../resources/json/tagPatterns.json";
import { InternalConfig } from "../types/aliases";
import { ConfigKey } from "../types/enums/configKey";
import { ConfigParameters } from "../types/interfaces/configParameters";

class Config {
  private static _instance: Config;

  public static get instance(): Config {
    if (!this._instance) {
      this._instance = new Config();
    }
    return this._instance;
  }

  private _internal: InternalConfig;

  private get internal(): InternalConfig {
    if (!this._internal) {
      this._internal = getRemoteConfig();
    }
    return this._internal;
  }

  init(defaultParams: ConfigParameters): void {
    const defaultConfig = {};
    Object.entries(defaultParams || {}).forEach(([key, param]) => {
      defaultConfig[key] = JSON.stringify(param);
    });
    if (this.internal) {
      this.internal.defaultConfig = defaultConfig;
    }
  }

  /**
   * Fetch the latest config values from the server and activate them.
   *
   * @param remoteConfig - The remote config instance.
   *
   * @returns A promise which resolves to true if the current call activated the fetched configs.
   * If the fetched configs were already activated, the promise will resolve to false.
   *
   */
  async fetchAndActivate(): Promise<boolean> {
    try {
      return _fetchAndActivate(this.internal);
    } catch (e) {
      const logWarn = (await import("../../impower-logger/utils/logWarn"))
        .default;
      logWarn(e);
    }
    return false;
  }

  /**
   * Fetches and caches configuration from the Remote Config service.
   *
   * @param remoteConfig - The `RemoteConfig` instance.
   */
  async fetch(): Promise<void> {
    try {
      _fetchConfig(this.internal);
    } catch (e) {
      const logWarn = (await import("../../impower-logger/utils/logWarn"))
        .default;
      logWarn(e);
    }
  }

  /**
   * Makes the last fetched config available to the getters.
   *
   * @param remoteConfig - The `RemoteConfig` instance.
   *
   * @returns A promise which resolves to true if the current call activated the fetched configs.
   * If the fetched configs were already activated, the promise will resolve to false.
   */
  async activate(): Promise<boolean> {
    try {
      return _activate(this.internal);
    } catch (e) {
      const logWarn = (await import("../../impower-logger/utils/logWarn"))
        .default;
      logWarn(e);
    }
    return false;
  }

  /**
   * Activates the values that were fetched the last time the app was started up.
   * And then fetches new values for next startup.
   *
   * @param remoteConfig - The `RemoteConfig` instance.
   *
   * @returns A promise which resolves to true if the current call activated the fetched configs.
   * If the fetched configs were already activated, the promise will resolve to false.
   */
  async activateThenFetch(): Promise<boolean> {
    const result = await this.activate();
    await this.fetch();
    return result;
  }

  private getValue<T>(key: ConfigKey, defaultValue?: T): T {
    if (!process.env.NEXT_PUBLIC_EMULATOR_HOST && this.internal) {
      try {
        const value = _getValue(this.internal, key).asString();
        if (value) {
          return JSON.parse(value);
        }
      } catch {
        // JSON.parse failed
      }
    }
    return defaultValue;
  }

  hydrate(): ConfigParameters {
    const params = {
      abbreviations: this.getValue("abbreviations", abbreviations),
      capitalizations: this.getValue("capitalizations", capitalizations),
      colors: this.getValue("colors", colors),
      projectTags: this.getValue("projectTags", projectTags),
      messages: this.getValue("messages", messages),
      moods: this.getValue("moods", moods),
      catalysts: this.getValue("catalysts", catalysts),
      archetypes: this.getValue("archetypes", archetypes.split(/\r?\n/)),
      phrases: this.getValue("phrases", phrases.split(/\r?\n/)),
      regexes: this.getValue("regexes", regexes),
      resourceTags: this.getValue("resourceTags", resourceTags),
      roleTags: this.getValue("roleTags", roleTags),
      tagColorNames: this.getValue("tagColorNames", tagColorNames),
      tagDisambiguations: this.getValue(
        "tagDisambiguations",
        tagDisambiguations
      ),
      tagIconNames: this.getValue("tagIconNames", tagIconNames),
      tagPatterns: this.getValue("tagPatterns", tagPatterns),
      terms: this.getValue("terms", terms),
    };
    return params;
  }
}

export default Config;
