import { ConfigParameters } from "../types/interfaces/configParameters";

type Unsubscribe = () => void;

class ConfigCache {
  private static _instance: ConfigCache;

  public static get instance(): ConfigCache {
    if (!this._instance) {
      this._instance = new ConfigCache();
    }
    return this._instance;
  }

  private _params: ConfigParameters = {
    abbreviations: undefined,
    capitalizations: undefined,
    colors: undefined,
    projectTags: undefined,
    moods: undefined,
    locations: undefined,
    atmospheres: undefined,
    visualStyles: undefined,
    musicalStyles: undefined,
    catalysts: undefined,
    archetypes: undefined,
    phrases: undefined,
    messages: undefined,
    regexes: undefined,
    resourceTags: undefined,
    roleTags: undefined,
    tagColorNames: undefined,
    tagDisambiguations: undefined,
    tagIconNames: undefined,
    tagPatterns: undefined,
    terms: undefined,
  };

  public icons: { [name: string]: { v: string; d: string } };

  public get params(): ConfigParameters {
    return this._params;
  }

  protected _listeners: Set<{
    callback: (value: ConfigParameters) => void;
    once?: boolean;
  }> = new Set();

  set(params: ConfigParameters): void {
    if (!params) {
      return;
    }
    const validParams = { ...params };
    Object.entries(params).forEach(([key, value]) => {
      if (!value) {
        delete validParams[key];
      }
    });
    this._params = { ...(this._params || {}), ...validParams };
    const listeners = Array.from(this._listeners);
    listeners.forEach((listener) => {
      if (listener) {
        const { callback, once } = listener;
        if (callback) {
          callback(this._params);
        }
        if (once) {
          this._listeners.delete(listener);
        }
      }
    });
    const load = async (): Promise<void> => {
      const Config = (await import("./config")).default;
      Config.instance.hydrate();
    };
    load();
  }

  observe(
    callback: (value: ConfigParameters) => void,
    once?: boolean
  ): Unsubscribe {
    const listener = { callback, once };
    this._listeners.add(listener);
    return (): void => {
      this._listeners.delete(listener);
    };
  }

  fetch(): Promise<ConfigParameters> {
    return new Promise((resolve) => {
      this.observe(resolve, true);
    });
  }
}

export default ConfigCache;
